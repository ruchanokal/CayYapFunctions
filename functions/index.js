const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

/**
 * Bildirim tipleri
 */
const NotificationType = {
  ORDER_APPROVED: "ORDER_APPROVED",
  ORDER_CANCELLED: "ORDER_CANCELLED",
  BALANCE_ADDED: "BALANCE_ADDED",
  BALANCE_DEDUCTED: "BALANCE_DEDUCTED",
  CUSTOMER_APPROVED: "CUSTOMER_APPROVED",
  CUSTOMER_REMOVED: "CUSTOMER_REMOVED",
  // İşletme bildirimleri
  NEW_ORDER: "NEW_ORDER",
  NEW_CUSTOMER_REQUEST: "NEW_CUSTOMER_REQUEST",
};

/**
 * Türk Lirası formatı: binler basamağı nokta, ondalık virgül (örn: 1.234,56)
 */
function formatCurrencyTR(value) {
  const num = Number(value);
  if (isNaN(num)) return "0,00";
  const fixed = num.toFixed(2);
  const [intPart, decPart] = fixed.split(".");
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${withThousands},${decPart}`;
}

/**
 * Bildirim mesajlarını oluştur
 */
function createNotificationMessage(notificationData) {
  const {type, title, body, businessName, amount, items} = notificationData;

  let notificationTitle = title || "Bildirim";
  let notificationBody = body || "";

  // Bildirim tipine göre özel mesajlar
  switch (type) {
    case NotificationType.ORDER_APPROVED: {
      // Başlık: "İşletme Adı - Siparişi Onayladı."
      notificationTitle = businessName
        ? `${businessName} - Siparişi Onayladı.`
        : "Siparişi Onayladı.";

      // Detay: Sipariş kalemleri
      if (items && Array.isArray(items) && items.length > 0) {
        notificationBody = items.map((item) => `${item.quantity} X ${item.name}`).join("\n");
      } else {
        notificationBody = "Siparişiniz onaylandı.";
      }
      break;
    }

    case NotificationType.ORDER_CANCELLED: {
      // Başlık: "İşletme Adı - Siparişi İptal Etti."
      notificationTitle = businessName
        ? `${businessName} - Siparişi İptal Etti.`
        : "Siparişi İptal Etti.";

      // Detay: Sipariş kalemleri
      if (items && Array.isArray(items) && items.length > 0) {
        notificationBody = items.map((item) => `${item.quantity} X ${item.name}`).join("\n");
      } else {
        notificationBody = "Siparişiniz iptal edildi.";
      }
      break;
    }

    case NotificationType.BALANCE_ADDED:
      notificationTitle = "Bakiye Eklendi";
      if (amount !== undefined && amount !== null) {
        const formattedAmount = formatCurrencyTR(amount);
        notificationBody = businessName
          ? `${businessName} hesabınıza ₺${formattedAmount} bakiye ekledi.`
          : `Hesabınıza ₺${formattedAmount} bakiye eklendi.`;
      } else {
        notificationBody = businessName
          ? `${businessName} hesabınıza bakiye ekledi.`
          : "Hesabınıza bakiye eklendi.";
      }
      break;

    case NotificationType.BALANCE_DEDUCTED:
      notificationTitle = "Bakiye Çıkarıldı";
      if (amount !== undefined && amount !== null) {
        const formattedAmount = formatCurrencyTR(amount);
        notificationBody = businessName
          ? `${businessName} hesabınızdan ₺${formattedAmount} bakiye çıkardı.`
          : `Hesabınızdan ₺${formattedAmount} bakiye çıkarıldı.`;
      } else {
        notificationBody = businessName
          ? `${businessName} hesabınızdan bakiye çıkardı.`
          : "Hesabınızdan bakiye çıkarıldı.";
      }
      break;

    case NotificationType.CUSTOMER_APPROVED:
      notificationTitle = "Müşteri Onayı";
      notificationBody = businessName
        ? `${businessName} sizi müşteri olarak onayladı.`
        : "Müşteri olarak onaylandınız.";
      break;

    case NotificationType.CUSTOMER_REMOVED:
      notificationTitle = "Müşteri Listesinden Çıkarıldınız";
      notificationBody = businessName
        ? `${businessName} sizi müşteri listesinden çıkardı.`
        : "Müşteri listesinden çıkarıldınız.";
      break;

    case NotificationType.NEW_ORDER: {
      const customerName = notificationData.customerName || "";
      const customerCompany = notificationData.customerCompany || "";
      const items = notificationData.items || [];

      // Başlık: {müşterinin çalıştığı yer}\n{müşteri adı soyadı}
      if (customerCompany && customerName) {
        notificationTitle = `${customerCompany}\n${customerName}`;
      } else if (customerName) {
        notificationTitle = customerName;
      } else {
        notificationTitle = "Yeni Sipariş";
      }

      // Detay: Sadece ürünler listesi
      if (items && items.length > 0) {
        notificationBody = items.map((item) => `${item.quantity} X ${item.name}`).join("\n");
      } else {
        notificationBody = "Yeni bir sipariş alındı";
      }
      break;
    }

    case NotificationType.NEW_CUSTOMER_REQUEST: {
      notificationTitle = "Yeni Müşteri İsteği";
      const newCustomerName = notificationData.customerName || "";
      notificationBody = newCustomerName
        ? `${newCustomerName} müşteri olarak kayıt olmak istiyor`
        : "Yeni bir müşteri kayıt isteği var";
      break;
    }

    default:
      // Varsayılan mesajlar kullanılır
      break;
  }

  return {
    title: notificationTitle,
    body: notificationBody,
  };
}

/**
 * Müşterinin FCM token'ını al
 */
async function getCustomerFcmToken(customerId) {
  try {
    const userDoc = await admin.firestore()
        .collection("users")
        .doc(customerId)
        .get();

    if (!userDoc.exists) {
      console.error(`❌ Kullanıcı bulunamadı: ${customerId}`);
      return null;
    }

    const userData = userDoc.data();
    const fcmToken = userData && userData.fcmToken ? userData.fcmToken : null;

    // Boş string veya null kontrolü
    if (!fcmToken || fcmToken.trim() === "") {
      console.warn(`⚠️ FCM Token bulunamadı veya boş: ${customerId}`);
      return null;
    }

    return fcmToken;
  } catch (error) {
    console.error(`❌ FCM Token alma hatası: ${error.message}`);
    return null;
  }
}

/**
 * İşletmenin FCM token'ını al
 */
async function getBusinessFcmToken(businessId) {
  try {
    const userDoc = await admin.firestore()
        .collection("users")
        .doc(businessId)
        .get();

    if (!userDoc.exists) {
      console.error(`❌ İşletme bulunamadı: ${businessId}`);
      return null;
    }

    const userData = userDoc.data();
    const fcmToken = userData && userData.fcmToken ? userData.fcmToken : null;

    // Boş string veya null kontrolü
    if (!fcmToken || fcmToken.trim() === "") {
      console.warn(`⚠️ İşletme FCM Token bulunamadı veya boş: ${businessId}`);
      return null;
    }

    return fcmToken;
  } catch (error) {
    console.error(`❌ İşletme FCM Token alma hatası: ${error.message}`);
    return null;
  }
}

/**
 * Kullanıcı bilgilerini al (ad-soyad ve çalıştığı yer)
 */
async function getUserInfo(userId) {
  try {
    const userDoc = await admin.firestore()
        .collection("users")
        .doc(userId)
        .get();

    if (!userDoc.exists) {
      console.error(`❌ Kullanıcı bulunamadı: ${userId}`);
      return null;
    }

    const userData = userDoc.data();
    return {
      nameSurname: userData && userData.nameSurname ? userData.nameSurname : "",
      company: userData && userData.company ? userData.company : "",
    };
  } catch (error) {
    console.error(`❌ Kullanıcı bilgisi alma hatası: ${error.message}`);
    return null;
  }
}

/**
 * İşletmeye bağlı garsonları al
 */
async function getStaffByBusinessId(businessId) {
  try {
    console.log(`🔍 Garsonlar sorgulanıyor - BusinessId: ${businessId}`);
    const staffSnapshot = await admin.firestore()
        .collection("users")
        .where("userType", "==", "garson")
        .where("companyId", "==", businessId)
        .get();

    console.log(`📊 Sorgu sonucu: ${staffSnapshot.size} doküman bulundu`);

    const staffList = [];
    staffSnapshot.forEach((doc) => {
      const userData = doc.data();
      const staffInfo = {
        id: doc.id,
        nameSurname: userData && userData.nameSurname ? userData.nameSurname : "",
        fcmToken: userData && userData.fcmToken ? userData.fcmToken : null,
        companyId: userData && userData.companyId ? userData.companyId : null,
        userType: userData && userData.userType ? userData.userType : null,
      };
      staffList.push(staffInfo);
      console.log(`👤 Garson bulundu: ${staffInfo.nameSurname} ` +
          `(ID: ${staffInfo.id}, CompanyId: ${staffInfo.companyId}, HasToken: ${!!staffInfo.fcmToken})`);
    });

    console.log(`👥 Toplam ${staffList.length} garson bulundu (BusinessId: ${businessId})`);
    return staffList;
  } catch (error) {
    console.error(`❌ Garsonlar alma hatası: ${error.message}`);
    console.error(`❌ Stack trace:`, error.stack);
    return [];
  }
}

/**
 * FCM push notification gönder
 */
async function sendFcmNotification(fcmToken, notificationData) {
  try {
    const message = createNotificationMessage(notificationData);
    const notificationType = notificationData.type || "";

    // NEW_ORDER tipi bildirimler için sadece data payload gönder
    // Böylece onMessageReceived her zaman çağrılır (foreground ve background)
    // ve gürültülü bildirim çalışır
    const isNewOrder = notificationType === NotificationType.NEW_ORDER;

    // Data payload'ı hazırla (tüm bildirimler için)
    const dataPayload = {
      type: notificationType,
      title: message.title,
      body: message.body,
      customerId: notificationData.customerId || "",
      businessId: notificationData.businessId || "",
      orderId: notificationData.orderId || "",
      businessName: notificationData.businessName || "",
      customerName: notificationData.customerName || "",
      amount: (notificationData.amount !== undefined && notificationData.amount !== null) ? notificationData.amount.toString() : "",
      totalPrice: (notificationData.totalPrice !== undefined && notificationData.totalPrice !== null) ? notificationData.totalPrice.toString() : "",
    };

    // Items array'ini JSON string olarak ekle (eğer varsa)
    if (notificationData.items && Array.isArray(notificationData.items)) {
      dataPayload.items = JSON.stringify(notificationData.items);
    }

    const payload = {
      token: fcmToken,
      data: dataPayload,
      android: {
        priority: "high",
      },
      apns: {
        payload: {
          aps: {
            alert: {
              title: message.title,
              body: message.body,
            },
            sound: "default",
            badge: 1,
            ...(isNewOrder && {"content-available": 1}),
          },
        },
      },
    };

    // NEW_ORDER için sadece data payload gönder (notification payload yok)
    // Diğer bildirimler için hem notification hem data payload gönder
    if (!isNewOrder) {
      payload.notification = {
        title: message.title,
        body: message.body,
      };
    }
    // Android notification konfigürasyonu (NEW_ORDER hariç)
    // NEW_ORDER için android.notification EKLENMEMELİ, yoksa FCM mesajı
    // notification mesajı gibi davranır ve onMessageReceived çağrılmaz.
    // Bu durumda sistem tray'i title/body olmadan boş bildirim gösterir.
    if (!isNewOrder) {
      payload.android.notification = {
        channelId: "cayyap_notifications",
        sound: "default",
      };
    }

    const response = await admin.messaging().send(payload);
    console.log(`✅ Bildirim başarıyla gönderildi: ${response}`);
    return {success: true, messageId: response};
  } catch (error) {
    console.error(`❌ FCM bildirim gönderme hatası: ${error.message}`);
    return {success: false, error: error.message};
  }
}

/**
 * Firestore trigger: notifications collection'ına yeni doküman eklendiğinde
 */
exports.sendNotificationToCustomer = functions.firestore
    .document("notifications/{notificationId}")
    .onCreate(async (snap, context) => {
      const notificationData = snap.data();
      const notificationId = context.params.notificationId;

      console.log(`📨 Yeni bildirim alındı: ${notificationId}`);
      console.log(`📊 Bildirim verisi (JSON):`, JSON.stringify(notificationData, null, 2));

      // Bildirim tipini kontrol et
      const notificationType = notificationData.type;
      console.log(`🔍 Bildirim tipi: ${notificationType}`);
      if (!notificationType) {
        console.warn(`⚠️ Bildirim tipi bulunamadı: ${notificationId}`);
        console.warn(`⚠️ Mevcut alanlar:`, Object.keys(notificationData));
        return null;
      }

      // Müşteri ID'sini al
      const customerId = notificationData.customerId;
      console.log(`🔍 Müşteri ID: ${customerId}`);
      if (!customerId) {
        console.warn(`⚠️ Müşteri ID'si bulunamadı: ${notificationId}`);
        return null;
      }

      // Müşterinin FCM token'ını al
      console.log(`🔍 FCM Token alınıyor...`);
      const fcmToken = await getCustomerFcmToken(customerId);
      if (!fcmToken) {
        console.warn(`⚠️ FCM Token bulunamadı, bildirim gönderilemedi: ${customerId}`);
        return null;
      }
      console.log(`✅ FCM Token bulundu: ${fcmToken.substring(0, 20)}...`);

      // Bildirim verisini hazırla
      const notificationPayload = {
        type: notificationType,
        title: notificationData.title || "",
        body: notificationData.body || "",
        customerId: customerId,
        businessId: notificationData.businessId || null,
        orderId: notificationData.orderId || null,
        amount: notificationData.amount || null,
        businessName: notificationData.businessName || null,
        items: notificationData.items || null, // Sipariş kalemleri
      };
      console.log(`📦 Bildirim payload hazırlandı:`, JSON.stringify(notificationPayload, null, 2));

      // FCM push notification gönder
      console.log(`📤 FCM bildirimi gönderiliyor...`);
      const result = await sendFcmNotification(fcmToken, notificationPayload);

      if (result.success) {
        console.log(`✅ Bildirim başarıyla gönderildi - CustomerId: ${customerId}, Type: ${notificationType}, MessageId: ${result.messageId}`);
      } else {
        console.error(`❌ Bildirim gönderme hatası - CustomerId: ${customerId}, Type: ${notificationType}, Error: ${result.error}`);
      }

      return result;
    });

/**
 * Firestore trigger: orders collection'ına yeni doküman eklendiğinde
 * İşletmeye "Yeni Sipariş" bildirimi gönder
 */
exports.sendNewOrderNotificationToBusiness = functions.firestore
    .document("orders/{orderId}")
    .onCreate(async (snap, context) => {
      const orderData = snap.data();
      const orderId = context.params.orderId;

      console.log(`📦 Yeni sipariş alındı: ${orderId}`);
      console.log(`📊 Sipariş verisi:`, JSON.stringify(orderData, null, 2));

      // İşletme ID'sini al
      const businessId = orderData.businessId;
      if (!businessId) {
        console.warn(`⚠️ İşletme ID'si bulunamadı: ${orderId}`);
        return null;
      }
      console.log(`🔍 İşletme ID: ${businessId}`);

      // Müşteri ID'sini al
      const customerId = orderData.customerId;
      if (!customerId) {
        console.warn(`⚠️ Müşteri ID'si bulunamadı: ${orderId}`);
        return null;
      }
      console.log(`🔍 Müşteri ID: ${customerId}`);

      // Müşteri bilgilerini al
      console.log(`🔍 Müşteri bilgileri alınıyor...`);
      const customerInfo = await getUserInfo(customerId);
      const customerName = customerInfo ? customerInfo.nameSurname : "";
      const customerCompany = customerInfo ? customerInfo.company : "";
      console.log(`👤 Müşteri: ${customerName}, Çalıştığı Yer: ${customerCompany}`);

      // Toplam fiyat
      const totalPrice = orderData.totalPrice || 0;

      // Sipariş kalemleri
      const items = orderData.items || [];

      // Bildirim verisini hazırla
      const notificationPayload = {
        type: NotificationType.NEW_ORDER,
        customerId: customerId,
        businessId: businessId,
        orderId: orderId,
        customerName: customerName,
        customerCompany: customerCompany,
        totalPrice: totalPrice,
        items: items,
      };
      console.log(`📦 Bildirim payload hazırlandı:`, JSON.stringify(notificationPayload, null, 2));

      // İşletmenin FCM token'ını al ve bildirim gönder
      console.log(`🔍 İşletme FCM Token alınıyor...`);
      const fcmToken = await getBusinessFcmToken(businessId);
      let businessResult = null;
      if (fcmToken) {
        console.log(`✅ İşletme FCM Token bulundu: ${fcmToken.substring(0, 20)}...`);
        console.log(`📤 FCM bildirimi gönderiliyor (işletmeye)...`);
        console.log(`📦 İşletmeye gönderilen payload:`, JSON.stringify(notificationPayload, null, 2));
        businessResult = await sendFcmNotification(fcmToken, notificationPayload);
        const businessMessage = createNotificationMessage(notificationPayload);
        console.log(`📝 İşletmeye gönderilen mesaj - Title: "${businessMessage.title}", Body: "${businessMessage.body}"`);

        if (businessResult.success) {
          console.log(`✅ İşletmeye bildirim başarıyla gönderildi - ` +
              `BusinessId: ${businessId}, OrderId: ${orderId}, MessageId: ${businessResult.messageId}`);
        } else {
          console.error(`❌ İşletmeye bildirim gönderme hatası - BusinessId: ${businessId}, OrderId: ${orderId}, Error: ${businessResult.error}`);
        }
      } else {
        console.warn(`⚠️ İşletme FCM Token bulunamadı, işletmeye bildirim gönderilemedi: ${businessId}`);
      }

      // Garsonlara bildirim gönder (işletme token'ı olsun ya da olmasın)
      console.log(`🔍 Garsonlar alınıyor (BusinessId: ${businessId})...`);
      const staffList = await getStaffByBusinessId(businessId);
      console.log(`📊 Garson listesi:`, JSON.stringify(staffList.map((s) => ({
        id: s.id,
        name: s.nameSurname,
        hasToken: !!s.fcmToken,
      })), null, 2));

      if (staffList.length > 0) {
        console.log(`👥 ${staffList.length} garson bulundu, bildirim gönderiliyor...`);

        // Her garsona bildirim gönder
        const staffNotificationPromises = staffList.map(async (staff) => {
          if (!staff.fcmToken || staff.fcmToken.trim() === "") {
            console.warn(`⚠️ Garson FCM Token bulunamadı: ${staff.id} (${staff.nameSurname})`);
            return null;
          }

          console.log(`📤 Garsona bildirim gönderiliyor: ${staff.nameSurname} ` +
              `(${staff.id}), Token: ${staff.fcmToken.substring(0, 20)}...`);
          console.log(`📦 Garsona gönderilen payload:`, JSON.stringify(notificationPayload, null, 2));
          const staffResult = await sendFcmNotification(staff.fcmToken, notificationPayload);
          const staffMessage = createNotificationMessage(notificationPayload);
          console.log(`📝 Garsona gönderilen mesaj - Title: "${staffMessage.title}", Body: "${staffMessage.body}"`);

          if (staffResult.success) {
            console.log(`✅ Garsona bildirim gönderildi - StaffId: ${staff.id}, Name: ${staff.nameSurname}, MessageId: ${staffResult.messageId}`);
          } else {
            console.error(`❌ Garsona bildirim gönderme hatası - StaffId: ${staff.id}, Name: ${staff.nameSurname}, Error: ${staffResult.error}`);
          }

          return staffResult;
        });

        // Tüm garson bildirimlerini bekle
        const results = await Promise.all(staffNotificationPromises);
        const successCount = results.filter((r) => r && r.success).length;
        const failCount = results.filter((r) => r && !r.success).length;
        const noTokenCount = results.filter((r) => !r).length;
        console.log(`✅ Tüm garsonlara bildirim gönderme işlemi tamamlandı - ` +
            `Başarılı: ${successCount}, Başarısız: ${failCount}, Token Yok: ${noTokenCount}`);
      } else {
        console.log(`ℹ️ Bu işletmeye bağlı garson bulunamadı (BusinessId: ${businessId})`);
      }

      // İşletme bildirimi başarılı olduysa onu döndür, değilse garson bildirimlerinden birini döndür
      return businessResult || {success: false, error: "İşletme token bulunamadı"};
    });

/**
 * Firestore trigger: relations collection'ına yeni doküman eklendiğinde
 * Status "pending" ise işletmeye "Yeni Müşteri İsteği" bildirimi gönder
 */
exports.sendNewCustomerRequestNotificationToBusiness = functions.firestore
    .document("relations/{relationId}")
    .onCreate(async (snap, context) => {
      const relationData = snap.data();
      const relationId = context.params.relationId;

      console.log(`🔗 Yeni ilişki oluşturuldu: ${relationId}`);
      console.log(`📊 İlişki verisi:`, JSON.stringify(relationData, null, 2));

      // Status kontrolü - sadece "pending" ise bildirim gönder
      const status = relationData.status;
      if (status !== "pending") {
        console.log(`ℹ️ İlişki status'u "pending" değil (${status}), bildirim gönderilmeyecek`);
        return null;
      }

      // İşletme ID'sini al
      const businessId = relationData.businessId;
      if (!businessId) {
        console.warn(`⚠️ İşletme ID'si bulunamadı: ${relationId}`);
        return null;
      }
      console.log(`🔍 İşletme ID: ${businessId}`);

      // Müşteri ID'sini al
      const customerId = relationData.customerId;
      if (!customerId) {
        console.warn(`⚠️ Müşteri ID'si bulunamadı: ${relationId}`);
        return null;
      }
      console.log(`🔍 Müşteri ID: ${customerId}`);

      // Müşteri bilgilerini al
      console.log(`🔍 Müşteri bilgileri alınıyor...`);
      const customerInfo = await getUserInfo(customerId);
      const customerName = customerInfo ? customerInfo.nameSurname : "";

      // İşletmenin FCM token'ını al
      console.log(`🔍 İşletme FCM Token alınıyor...`);
      const fcmToken = await getBusinessFcmToken(businessId);
      if (!fcmToken) {
        console.warn(`⚠️ İşletme FCM Token bulunamadı, bildirim gönderilemedi: ${businessId}`);
        return null;
      }
      console.log(`✅ İşletme FCM Token bulundu: ${fcmToken.substring(0, 20)}...`);

      // Bildirim verisini hazırla
      const notificationPayload = {
        type: NotificationType.NEW_CUSTOMER_REQUEST,
        customerId: customerId,
        businessId: businessId,
        customerName: customerName,
      };
      console.log(`📦 Bildirim payload hazırlandı:`, JSON.stringify(notificationPayload, null, 2));

      // FCM push notification gönder
      console.log(`📤 FCM bildirimi gönderiliyor...`);
      const result = await sendFcmNotification(fcmToken, notificationPayload);

      if (result.success) {
        console.log(`✅ Bildirim başarıyla gönderildi - BusinessId: ${businessId}, CustomerId: ${customerId}, MessageId: ${result.messageId}`);
      } else {
        console.error(`❌ Bildirim gönderme hatası - BusinessId: ${businessId}, CustomerId: ${customerId}, Error: ${result.error}`);
      }

      return result;
    });

