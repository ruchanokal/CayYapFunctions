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
 * Bildirim mesajlarını oluştur
 */
function createNotificationMessage(notificationData) {
  const {type, title, body, businessName, amount} = notificationData;

  let notificationTitle = title || "Bildirim";
  let notificationBody = body || "";

  // Bildirim tipine göre özel mesajlar
  switch (type) {
    case NotificationType.ORDER_APPROVED:
      notificationTitle = "Siparişiniz Onaylandı";
      notificationBody = businessName
        ? `${businessName} siparişinizi onayladı.`
        : "Siparişiniz onaylandı.";
      break;

    case NotificationType.ORDER_CANCELLED:
      notificationTitle = "Siparişiniz İptal Edildi";
      notificationBody = businessName
        ? `${businessName} siparişinizi iptal etti.`
        : "Siparişiniz iptal edildi.";
      break;

    case NotificationType.BALANCE_ADDED:
      notificationTitle = "Bakiye Eklendi";
      if (amount !== undefined && amount !== null) {
        const formattedAmount = amount.toFixed(2);
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
        const formattedAmount = amount.toFixed(2);
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
      notificationTitle = "Yeni Sipariş";
      const customerName = notificationData.customerName || "";
      const totalPrice = notificationData.totalPrice;
      if (totalPrice !== undefined && totalPrice !== null) {
        const formattedPrice = totalPrice.toFixed(2);
        notificationBody = customerName
          ? `${customerName} yeni bir sipariş verdi (₺${formattedPrice})`
          : `Yeni bir sipariş alındı (₺${formattedPrice})`;
      } else {
        notificationBody = customerName
          ? `${customerName} yeni bir sipariş verdi`
          : "Yeni bir sipariş alındı";
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

    if (!fcmToken) {
      console.warn(`⚠️ FCM Token bulunamadı: ${customerId}`);
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

    if (!fcmToken) {
      console.warn(`⚠️ İşletme FCM Token bulunamadı: ${businessId}`);
      return null;
    }

    return fcmToken;
  } catch (error) {
    console.error(`❌ İşletme FCM Token alma hatası: ${error.message}`);
    return null;
  }
}

/**
 * Kullanıcı bilgilerini al (ad-soyad)
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
 * FCM push notification gönder
 */
async function sendFcmNotification(fcmToken, notificationData) {
  try {
    const message = createNotificationMessage(notificationData);

    const payload = {
      notification: {
        title: message.title,
        body: message.body,
      },
      data: {
        type: notificationData.type || "",
        customerId: notificationData.customerId || "",
        businessId: notificationData.businessId || "",
        orderId: notificationData.orderId || "",
        businessName: notificationData.businessName || "",
        customerName: notificationData.customerName || "",
        amount: (notificationData.amount !== undefined && notificationData.amount !== null) ? notificationData.amount.toString() : "",
        totalPrice: (notificationData.totalPrice !== undefined && notificationData.totalPrice !== null) ? notificationData.totalPrice.toString() : "",
      },
      token: fcmToken,
      android: {
        priority: "high",
        notification: {
          channelId: "cayyap_notifications",
          sound: "default",
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
            badge: 1,
          },
        },
      },
    };

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

      // İşletmenin FCM token'ını al
      console.log(`🔍 İşletme FCM Token alınıyor...`);
      const fcmToken = await getBusinessFcmToken(businessId);
      if (!fcmToken) {
        console.warn(`⚠️ İşletme FCM Token bulunamadı, bildirim gönderilemedi: ${businessId}`);
        return null;
      }
      console.log(`✅ İşletme FCM Token bulundu: ${fcmToken.substring(0, 20)}...`);

      // Toplam fiyat
      const totalPrice = orderData.totalPrice || 0;

      // Bildirim verisini hazırla
      const notificationPayload = {
        type: NotificationType.NEW_ORDER,
        customerId: customerId,
        businessId: businessId,
        orderId: orderId,
        customerName: customerName,
        totalPrice: totalPrice,
      };
      console.log(`📦 Bildirim payload hazırlandı:`, JSON.stringify(notificationPayload, null, 2));

      // FCM push notification gönder
      console.log(`📤 FCM bildirimi gönderiliyor...`);
      const result = await sendFcmNotification(fcmToken, notificationPayload);

      if (result.success) {
        console.log(`✅ Bildirim başarıyla gönderildi - BusinessId: ${businessId}, OrderId: ${orderId}, MessageId: ${result.messageId}`);
      } else {
        console.error(`❌ Bildirim gönderme hatası - BusinessId: ${businessId}, OrderId: ${orderId}, Error: ${result.error}`);
      }

      return result;
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

