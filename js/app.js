/**
 * Memento Box - Main Application Logic
 */

import driveService from './drive.js';

// State
let currentScreen = 'home';
let currentItem = null;
let currentMediaRecorder = null;
let currentAudioChunks = [];
let captureState = {
    imageFile: null,
    imageDriveId: null,
    audioBlob: null,
    audioDriveId: null,
    status: 'DRAFT',
    needsHelp: false
};

// Elements
const screens = {
    home: document.getElementById('home-screen'),
    capture: document.getElementById('capture-screen'),
    detail: document.getElementById('detail-screen')
};

const steps = {
    photo: document.getElementById('step-photo'),
    audio: document.getElementById('step-audio'),
    status: document.getElementById('step-status')
};

// Initialize app
async function init() {
    console.log('🎨 Memento Box initializing...');

    // Set up event listeners
    setupEventListeners();

    // Load and display memories
    await loadMemories();

    console.log('✅ Memento Box ready');
}

// Set up all event listeners
function setupEventListeners() {
    // Navigation
    document.getElementById('add-memory-btn').addEventListener('click', startCapture);
    document.getElementById('back-to-home').addEventListener('click', () => showScreen('home'));
    document.getElementById('back-to-home-from-detail').addEventListener('click', () => showScreen('home'));

    // Photo step
    document.getElementById('take-photo-btn').addEventListener('click', () => {
        document.getElementById('photo-input').click();
    });

    document.getElementById('photo-input').addEventListener('change', handlePhotoSelected);

    // Audio step
    document.getElementById('record-audio-btn').addEventListener('click', startRecording);
    document.getElementById('stop-audio-btn').addEventListener('click', stopRecording);
    document.getElementById('skip-audio-btn').addEventListener('click', () => showStep('status'));

    // Status step
    document.querySelectorAll('.status-btn').forEach(btn => {
        btn.addEventListener('click', handleStatusSelected);
    });

    // Detail screen
    document.getElementById('delete-memory-btn').addEventListener('click', handleDelete);
}

// Screen navigation
function showScreen(screenName) {
    Object.values(screens).forEach(screen => screen.classList.add('hidden'));
    screens[screenName].classList.remove('hidden');
    currentScreen = screenName;

    if (screenName === 'home') {
        loadMemories();
    }
}

// Step navigation within capture flow
function showStep(stepName) {
    Object.values(steps).forEach(step => step.classList.add('hidden'));
    steps[stepName].classList.remove('hidden');
}

// Start capture flow
function startCapture() {
    // Reset state
    captureState = {
        imageFile: null,
        imageDriveId: null,
        audioBlob: null,
        audioDriveId: null,
        status: 'DRAFT',
        needsHelp: false
    };

    // Reset UI
    document.getElementById('photo-preview').innerHTML = `
        <div class="photo-placeholder">
            <span class="placeholder-icon">📷</span>
            <p>No photo yet</p>
        </div>
    `;

    document.getElementById('audio-status').textContent = 'Ready to record';
    document.getElementById('record-audio-btn').classList.remove('hidden');
    document.getElementById('stop-audio-btn').classList.add('hidden');
    document.getElementById('skip-audio-btn').classList.add('hidden');

    document.querySelectorAll('.status-btn').forEach(btn => {
        btn.classList.remove('selected');
    });

    document.getElementById('needs-help-checkbox').checked = false;

    // Show capture screen
    showScreen('capture');
    showStep('photo');
}

// Handle photo selection
async function handlePhotoSelected(e) {
    const file = e.target.files[0];
    if (!file) return;

    captureState.imageFile = file;

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('photo-preview').innerHTML = `
            <img src="${e.target.result}" alt="Captured photo">
        `;
    };
    reader.readAsDataURL(file);

    // Upload to "Drive"
    try {
        updateSyncStatus('🟡 Uploading photo...');
        captureState.imageDriveId = await driveService.uploadImage(file);
        updateSyncStatus('🟢 Photo saved');

        // Move to next step
        setTimeout(() => showStep('audio'), 500);
    } catch (error) {
        console.error('Failed to upload photo:', error);
        updateSyncStatus('🔴 Upload failed');
        alert('Failed to save photo. Please try again.');
    }
}

// Start audio recording
async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        currentMediaRecorder = new MediaRecorder(stream);
        currentAudioChunks = [];

        currentMediaRecorder.ondataavailable = (e) => {
            currentAudioChunks.push(e.data);
        };

        currentMediaRecorder.onstop = async () => {
            const audioBlob = new Blob(currentAudioChunks, { type: 'audio/webm' });
            captureState.audioBlob = audioBlob;

            // Upload to "Drive"
            try {
                updateSyncStatus('🟡 Uploading audio...');
                captureState.audioDriveId = await driveService.uploadAudio(audioBlob);
                updateSyncStatus('🟢 Audio saved');

                // Move to next step
                setTimeout(() => showStep('status'), 500);
            } catch (error) {
                console.error('Failed to upload audio:', error);
                updateSyncStatus('🔴 Upload failed');
                alert('Failed to save audio. Please try again.');
            }

            // Stop all tracks
            stream.getTracks().forEach(track => track.stop());
        };

        currentMediaRecorder.start();

        // Update UI
        document.getElementById('audio-status').textContent = '🔴 Recording...';
        document.getElementById('audio-visualizer').classList.add('audio-recording');
        document.getElementById('record-audio-btn').classList.add('hidden');
        document.getElementById('stop-audio-btn').classList.remove('hidden');
        document.getElementById('skip-audio-btn').classList.add('hidden');

    } catch (error) {
        console.error('Failed to start recording:', error);
        alert('Could not access microphone. You can skip this step.');

        // Show skip button
        document.getElementById('record-audio-btn').classList.add('hidden');
        document.getElementById('skip-audio-btn').classList.remove('hidden');
    }
}

// Stop audio recording
function stopRecording() {
    if (currentMediaRecorder && currentMediaRecorder.state === 'recording') {
        currentMediaRecorder.stop();

        // Update UI
        document.getElementById('audio-visualizer').classList.remove('audio-recording');
        document.getElementById('audio-status').textContent = '✅ Recording saved';
        document.getElementById('stop-audio-btn').classList.add('hidden');
    }
}

// Handle status selection
async function handleStatusSelected(e) {
    const btn = e.currentTarget;
    const status = btn.dataset.status;

    // Update UI
    document.querySelectorAll('.status-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');

    captureState.status = status;
    captureState.needsHelp = document.getElementById('needs-help-checkbox').checked;

    // Save the item
    await saveMemory();
}

// Save memory to Drive
async function saveMemory() {
    try {
        updateSyncStatus('🟡 Saving memory...');

        const item = {
            id: generateUUID(),
            createdAt: Date.now(),
            updatedAt: Date.now(),
            imageDriveId: captureState.imageDriveId,
            audioDriveId: captureState.audioDriveId,
            status: captureState.status,
            needsHelp: captureState.needsHelp
        };

        await driveService.saveItem(item);

        updateSyncStatus('🟢 All saved');

        // Show success and return home
        setTimeout(() => {
            showScreen('home');
        }, 500);

    } catch (error) {
        console.error('Failed to save memory:', error);
        updateSyncStatus('🔴 Save failed');
        alert('Failed to save memory. Please try again.');
    }
}

// Load and display memories
async function loadMemories() {
    try {
        const inventory = await driveService.readInventory();
        const items = Object.values(inventory.items);

        // Update count
        document.getElementById('item-count').textContent =
            `${items.length} ${items.length === 1 ? 'memory' : 'memories'}`;

        // Render list
        const listElement = document.getElementById('memory-list');

        if (items.length === 0) {
            listElement.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📦</div>
                    <h2>No memories yet</h2>
                    <p>Tap the button below to capture your first memory</p>
                </div>
            `;
        } else {
            // Sort by date (newest first)
            items.sort((a, b) => b.createdAt - a.createdAt);

            listElement.innerHTML = items.map(item => {
                const imageUrl = driveService.getMediaUrl(item.imageDriveId);
                const date = new Date(item.createdAt);
                const dateStr = formatDate(date);

                return `
                    <div class="memory-card" data-item-id="${item.id}">
                        <img src="${imageUrl}" alt="Memory" class="memory-card-image">
                        <div class="memory-card-info">
                            <span class="memory-card-status ${item.status.toLowerCase()}">${formatStatus(item.status)}</span>
                            <p class="memory-card-date">${dateStr}</p>
                            ${item.needsHelp ? '<p class="memory-card-date">📦 Needs help moving</p>' : ''}
                        </div>
                    </div>
                `;
            }).join('');

            // Add click handlers
            listElement.querySelectorAll('.memory-card').forEach(card => {
                card.addEventListener('click', () => {
                    const itemId = card.dataset.itemId;
                    showMemoryDetail(itemId);
                });
            });
        }

        updateSyncStatus('🟢 All saved');

    } catch (error) {
        console.error('Failed to load memories:', error);
        updateSyncStatus('🔴 Load failed');
    }
}

// Show memory detail
async function showMemoryDetail(itemId) {
    try {
        const inventory = await driveService.readInventory();
        const item = inventory.items[itemId];

        if (!item) return;

        currentItem = item;

        // Set image
        const imageUrl = driveService.getMediaUrl(item.imageDriveId);
        document.getElementById('detail-photo').src = imageUrl;

        // Set status
        const statusBadge = document.getElementById('detail-status');
        statusBadge.textContent = formatStatus(item.status);
        statusBadge.className = 'status-badge';

        // Set date
        const date = new Date(item.createdAt);
        document.getElementById('detail-date').textContent = formatDate(date);

        // Set audio
        const audioElement = document.getElementById('detail-audio');
        if (item.audioDriveId) {
            const audioUrl = driveService.getMediaUrl(item.audioDriveId);
            audioElement.src = audioUrl;
            audioElement.classList.remove('hidden');
        } else {
            audioElement.classList.add('hidden');
        }

        showScreen('detail');

    } catch (error) {
        console.error('Failed to load memory detail:', error);
        alert('Failed to load memory details.');
    }
}

// Handle delete
async function handleDelete() {
    if (!currentItem) return;

    const confirmed = confirm('Are you sure you want to delete this memory? This cannot be undone.');
    if (!confirmed) return;

    try {
        updateSyncStatus('🟡 Deleting...');
        await driveService.deleteItem(currentItem.id);
        updateSyncStatus('🟢 Deleted');

        setTimeout(() => {
            showScreen('home');
        }, 300);

    } catch (error) {
        console.error('Failed to delete memory:', error);
        updateSyncStatus('🔴 Delete failed');
        alert('Failed to delete memory. Please try again.');
    }
}

// Update sync status
function updateSyncStatus(text) {
    document.getElementById('sync-status').textContent = text;
}

// Format status for display
function formatStatus(status) {
    const statusMap = {
        'KEEP': '💚 Keep',
        'GIFT': '🎁 Gift',
        'DONATE': '🤝 Donate',
        'DRAFT': '📝 Draft'
    };
    return statusMap[status] || status;
}

// Format date for display
function formatDate(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

    return date.toLocaleDateString();
}

// Generate UUID (duplicate from drive.js for convenience)
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Start the app
init();
