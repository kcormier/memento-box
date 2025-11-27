/**
 * Memento Box - Mock Drive Service
 * Simulates Google Drive "Vault" using localStorage
 */

// Generate UUIDs
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Client ID for this instance
const CLIENT_ID = localStorage.getItem('clientId') || (() => {
    const id = generateUUID();
    localStorage.setItem('clientId', id);
    return id;
})();

class MockDriveService {
    constructor() {
        this.LOCK_KEY = 'memento_lock';
        this.INVENTORY_KEY = 'memento_inventory';
        this.MEDIA_PREFIX = 'memento_media_';
        this.LOCK_TTL = 5 * 60 * 1000; // 5 minutes
        this.MAX_RETRY = 3;
        this.RETRY_DELAY = 1000; // 1 second
    }

    /**
     * Check if lock exists and is valid
     */
    _isLockActive() {
        const lockData = localStorage.getItem(this.LOCK_KEY);
        if (!lockData) return false;
        
        try {
            const lock = JSON.parse(lockData);
            const now = Date.now();
            
            // Lock is active if not expired and owned by another client
            if (lock.expiresAt > now && lock.clientId !== CLIENT_ID) {
                return true;
            }
            
            // Lock expired or owned by us - can proceed
            return false;
        } catch (e) {
            console.error('Error parsing lock:', e);
            return false;
        }
    }

    /**
     * Acquire lock with retry logic
     */
    async _acquireLock(retryCount = 0) {
        if (this._isLockActive()) {
            if (retryCount >= this.MAX_RETRY) {
                throw new Error('Vault is busy. Please try again in a moment.');
            }
            
            // Wait and retry
            await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY));
            return this._acquireLock(retryCount + 1);
        }
        
        // Acquire lock
        const lock = {
            clientId: CLIENT_ID,
            timestamp: Date.now(),
            expiresAt: Date.now() + this.LOCK_TTL
        };
        
        localStorage.setItem(this.LOCK_KEY, JSON.stringify(lock));
        
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    /**
     * Release lock
     */
    async _releaseLock() {
        const lockData = localStorage.getItem(this.LOCK_KEY);
        if (lockData) {
            try {
                const lock = JSON.parse(lockData);
                if (lock.clientId === CLIENT_ID) {
                    localStorage.removeItem(this.LOCK_KEY);
                }
            } catch (e) {
                console.error('Error releasing lock:', e);
            }
        }
        
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 50));
    }

    /**
     * Read inventory from storage
     */
    async readInventory() {
        const data = localStorage.getItem(this.INVENTORY_KEY);
        if (!data) {
            return { version: 1, items: {} };
        }
        
        try {
            return JSON.parse(data);
        } catch (e) {
            console.error('Error parsing inventory:', e);
            return { version: 1, items: {} };
        }
    }

    /**
     * Write inventory to storage (with locking)
     */
    async writeInventory(inventory) {
        try {
            await this._acquireLock();
            
            // Re-read latest to avoid conflicts
            const latest = await this.readInventory();
            
            // Merge items (last write wins for now)
            const merged = {
                version: latest.version + 1,
                items: { ...latest.items, ...inventory.items }
            };
            
            localStorage.setItem(this.INVENTORY_KEY, JSON.stringify(merged));
            
            await this._releaseLock();
            
            return merged;
        } catch (error) {
            await this._releaseLock();
            throw error;
        }
    }

    /**
     * Upload image to "Drive" (store as base64)
     */
    async uploadImage(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = async (e) => {
                const imageId = generateUUID();
                const imageData = e.target.result;
                
                // Store image
                localStorage.setItem(this.MEDIA_PREFIX + imageId, imageData);
                
                // Simulate upload delay
                await new Promise(r => setTimeout(r, 300));
                
                resolve(imageId);
            };
            
            reader.onerror = () => {
                reject(new Error('Failed to read image'));
            };
            
            reader.readAsDataURL(file);
        });
    }

    /**
     * Upload audio to "Drive" (store as blob URL or base64)
     */
    async uploadAudio(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = async (e) => {
                const audioId = generateUUID();
                const audioData = e.target.result;
                
                // Store audio
                localStorage.setItem(this.MEDIA_PREFIX + audioId, audioData);
                
                // Simulate upload delay
                await new Promise(r => setTimeout(r, 300));
                
                resolve(audioId);
            };
            
            reader.onerror = () => {
                reject(new Error('Failed to read audio'));
            };
            
            reader.readAsDataURL(blob);
        });
    }

    /**
     * Get media URL by ID
     */
    getMediaUrl(mediaId) {
        return localStorage.getItem(this.MEDIA_PREFIX + mediaId);
    }

    /**
     * Delete item from inventory
     */
    async deleteItem(itemId) {
        try {
            await this._acquireLock();
            
            const inventory = await this.readInventory();
            const item = inventory.items[itemId];
            
            if (item) {
                // Delete media files
                if (item.imageDriveId) {
                    localStorage.removeItem(this.MEDIA_PREFIX + item.imageDriveId);
                }
                if (item.audioDriveId) {
                    localStorage.removeItem(this.MEDIA_PREFIX + item.audioDriveId);
                }
                
                // Delete item from inventory
                delete inventory.items[itemId];
                
                localStorage.setItem(this.INVENTORY_KEY, JSON.stringify(inventory));
            }
            
            await this._releaseLock();
            
            return inventory;
        } catch (error) {
            await this._releaseLock();
            throw error;
        }
    }

    /**
     * Save a new item
     */
    async saveItem(item) {
        const inventory = await this.readInventory();
        inventory.items[item.id] = item;
        return await this.writeInventory(inventory);
    }
}

export default new MockDriveService();
