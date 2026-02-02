require('dotenv').config();
const fs = require('fs');
const express = require('express');
const webpush = require('web-push');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));   //koristit ćemo za fotografije
app.use(express.static('public'));

// VAPID keys
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || 'BKjvx6IcoYrBeE6jZZ53gIBKOEq-HTptzM0M8kCOEmrtqgL2kbFsKwnQM5DmHHGMQSf0VMb2hmpWYH4YQxMW4IU';
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '4bJkNsj7Bjh4PDjyCBGrDegIm9BKY9QSIFbNNJDPcrg';

webpush.setVapidDetails(
  'mailto:example@domain.com',
  vapidPublicKey,
  vapidPrivateKey
);

// spremit ćemo subscriptions u file
const SUBS_FILENAME = 'subscriptions.json';
let subscriptions = [];

try {
  if (fs.existsSync(SUBS_FILENAME)) {
    const data = fs.readFileSync(SUBS_FILENAME, 'utf8');
    subscriptions = JSON.parse(data);
    console.log(`Loaded ${subscriptions.length} subscriptions from file`);
  }
} catch (error) {
  console.error('Error loading subscriptions:', error);
  subscriptions = [];
}

// mock API endpoint za spremanje notes
app.post('/api/notes', (req, res) => {
  console.log('Note saved:', req.body.text?.substring(0, 50));
  res.json({ success: true, id: Date.now() });
});

// API endpoint for push subscription
app.post('/api/subscribe', (req, res) => {
  const subscription = req.body;
  
  const exists = subscriptions.some(sub => 
    sub.endpoint === subscription.endpoint
  );
  
  if (!exists) {
    subscriptions.push(subscription);

    try {
      fs.writeFileSync(SUBS_FILENAME, JSON.stringify(subscriptions, null, 2));
      console.log('New subscription added and saved to file');
    } catch (error) {
      console.error('Error saving subscription to file:', error);
    }
  } else {
    console.log('Subscription already exists');
  }
  
  res.json({ success: true });
});

// API endpoint za push notification
app.post('/api/notify', async (req, res) => {
  const payload = JSON.stringify({
    title: 'PhotoNote',
    body: req.body.message || 'Your note has been synced!'
  });

  const results = {
    success: 0,
    failed: 0
  };

  // Send za sve subscriptions
  for (let i = subscriptions.length - 1; i >= 0; i--) {
    try {
      await webpush.sendNotification(subscriptions[i], payload);
      results.success++;
    } catch (error) {
      console.error('Error sending notification:', error);
      results.failed++;
      
      // makni nevažeće (410 = Gone, 404 = Not Found)
      if (error.statusCode === 410 || error.statusCode === 404) {
        console.log('Removing invalid subscription');
        subscriptions.splice(i, 1);
      }
    }
  }

  // spremi updateanu subscriptions list
  try {
    fs.writeFileSync(SUBS_FILENAME, JSON.stringify(subscriptions, null, 2));
  } catch (error) {
    console.error('Error saving updated subscriptions:', error);
  }

  console.log(`Notifications sent: ${results.success} success, ${results.failed} failed`);
  res.json({ success: true, results });
});

// Endpoint za VAPID public key
app.get('/api/vapid-public-key', (req, res) => {
  res.json({ publicKey: vapidPublicKey });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Loaded ${subscriptions.length} push subscriptions`);
});
