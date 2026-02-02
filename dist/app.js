let currentPhotoData = null;
let stream = null;

async function requestNotificationPermission(registration) {
  const permission = await Notification.requestPermission();
  
  if (permission === 'granted') {
    try {
      const response = await fetch('/api/vapid-public-key');
      const { publicKey } = await response.json();
      
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });
      
      await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription)
      });
      
      console.log('Push subscription successful');
    } catch (err) {
      console.error('Push subscription failed:', err);
    }
  }
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
    .then(reg => {
      console.log('Service Worker registered');
      
      if ('PushManager' in window) {
        requestNotificationPermission(reg);
      }
    })
    .catch(err => console.error('SW registration failed:', err));
}

// kamera
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const startCameraBtn = document.getElementById('startCamera');
const takePhotoBtn = document.getElementById('takePhoto');
const photoPreview = document.getElementById('photoPreview');

startCameraBtn.addEventListener('click', async () => {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ 
      video: { facingMode: 'environment' },
      audio: false 
    });
    video.srcObject = stream;
    video.style.display = 'block';
    startCameraBtn.style.display = 'none';
    takePhotoBtn.style.display = 'inline-block';
  } catch (err) {
  }
});

takePhotoBtn.addEventListener('click', () => {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0);
  
  currentPhotoData = canvas.toDataURL('image/jpeg', 0.8);
  
  photoPreview.innerHTML = `<img src="${currentPhotoData}" alt="Snimljena fotografija">`;
  
  // zaustavi stream od kamere
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }
  video.style.display = 'none';
  takePhotoBtn.style.display = 'none';
  startCameraBtn.style.display = 'inline-block';
  
  updateSubmitButton();
});

// enable/disable submit button, treba postojati i slika i opis
function updateSubmitButton() {
  const text = document.getElementById('noteText').value.trim();
  const submitBtn = document.querySelector('#noteForm button[type="submit"]');
  
  if (currentPhotoData && text) {
    submitBtn.disabled = false;
  } else {
    submitBtn.disabled = true;
  }
}

// listener za unos teksta
document.getElementById('noteText').addEventListener('input', updateSubmitButton);

// submission bilješke
document.getElementById('noteForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const text = document.getElementById('noteText').value.trim();
  
  const note = {
    id: Date.now(),
    text,
    photo: currentPhotoData,
    timestamp: new Date().toISOString()
  };
  
  // spremi lokalno
  saveNoteLocally(note);
  
  // pokušaj sync
  if (navigator.onLine) {
    await syncNote(note);
  } else {
    // postoji li background sync
    if ('serviceWorker' in navigator && 'sync' in navigator.serviceWorker) {
      const registration = await navigator.serviceWorker.ready;
      await registration.sync.register('sync-notes');
    }
  }
  
  // očisti formu
  document.getElementById('noteText').value = '';
  currentPhotoData = null;
  photoPreview.innerHTML = '';
  updateSubmitButton();
  
  displayNotes();
});

function saveNoteLocally(note) {
  const notes = JSON.parse(localStorage.getItem('notes') || '[]');
  notes.unshift(note);
  localStorage.setItem('notes', JSON.stringify(notes));
}

function deleteNote(noteId) {
  if (!confirm('Jeste li sigurni da želite obrisati ovu bilješku?')) {
    return;
  }
  
  let notes = JSON.parse(localStorage.getItem('notes') || '[]');
  notes = notes.filter(note => note.id !== noteId);
  localStorage.setItem('notes', JSON.stringify(notes));
  
  displayNotes();
}

async function syncNote(note) {
  try {
    const response = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(note)
    });
    
    if (response.ok) {
      // Send push notification
      await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Nova bilješka sinkronizirana!' })
      });
    }
  } catch (err) {
    console.error('Sync error:', err);
  }
}

function displayNotes() {
  const notes = JSON.parse(localStorage.getItem('notes') || '[]');
  const notesDiv = document.getElementById('notes');
  
  if (notes.length === 0) {
    notesDiv.innerHTML = '<p>Nema spremljenih bilješki</p>';
    return;
  }
  
  notesDiv.innerHTML = notes.map(note => `
    <div class="note">
      <div class="note-header">
        <span class="note-time">${new Date(note.timestamp).toLocaleString('hr-HR')}</span>
        <button class="delete-btn" onclick="deleteNote(${note.id})">Obriši</button>
      </div>
      <p>${note.text}</p>
      ${note.photo ? `<img src="${note.photo}" alt="Fotografija">` : ''}
    </div>
  `).join('');
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

displayNotes();

updateSubmitButton();