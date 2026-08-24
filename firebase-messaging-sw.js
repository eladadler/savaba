importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            "AIzaSyBkHWCZhg56GW-kJ4VmlmC4zUAhHFLDGn8",
  authDomain:        "savaba-56eb7.firebaseapp.com",
  projectId:         "savaba-56eb7",
  storageBucket:     "savaba-56eb7.firebasestorage.app",
  messagingSenderId: "939959882149",
  appId:             "1:939959882149:web:23ea7fe3bb3323fac4584c"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {
  const title = payload.notification?.title || 'סבבה והכל';
  const body  = payload.notification?.body  || '';
  self.registration.showNotification(title, {
    body,
    icon:  '/favicon.svg',
    badge: '/favicon.svg',
    dir:   'rtl',
    lang:  'he',
    requireInteraction: true,
    data: { link: payload.fcmOptions?.link || 'https://www.sababa-and-all.com/#match' },
  });
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const link = e.notification.data?.link || 'https://www.sababa-and-all.com/#match';
  e.waitUntil(clients.openWindow(link));
});
