# Çay Yap - Firebase Cloud Functions

Bu proje, Çay Yap uygulaması için Firebase Cloud Functions içerir.

## Özellikler

- **Müşteri Bildirimleri**: Firestore `notifications` collection'ına yeni doküman eklendiğinde müşterilere FCM push notification gönderir.

## Kurulum

1. Firebase CLI'yi yükleyin:
```bash
npm install -g firebase-tools
```

2. Firebase'e giriş yapın:
```bash
firebase login
```

3. Projeyi başlatın:
```bash
firebase init functions
```

4. Bağımlılıkları yükleyin:
```bash
cd functions
npm install
```

## Deployment

Functions'ları deploy etmek için:
```bash
firebase deploy --only functions
```

## Functions

### sendNotificationToCustomer

Firestore `notifications` collection'ına yeni doküman eklendiğinde tetiklenir ve müşteriye FCM push notification gönderir.

**Trigger**: `notifications/{notificationId}` onCreate

**Desteklenen Bildirim Tipleri**:
- `ORDER_APPROVED`: Sipariş onaylandı
- `ORDER_CANCELLED`: Sipariş iptal edildi
- `BALANCE_ADDED`: Bakiye eklendi
- `BALANCE_DEDUCTED`: Bakiye çıkarıldı
- `CUSTOMER_APPROVED`: Müşteri onaylandı
- `CUSTOMER_REMOVED`: Müşteri listesinden çıkarıldı

## Test

Local emulator ile test etmek için:
```bash
npm run serve
```

