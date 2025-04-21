// Initialize notification permissions and check interval
function initNotifications() {
    // Check if the browser supports notifications
    if (!("Notification" in window)) {
        console.log("This browser does not support desktop notifications");
        notificationsEnabled = false;
        return;
    }

    // Clear any existing interval to prevent duplicates
    if (notificationCheckInterval) {
        clearInterval(notificationCheckInterval);
        notificationCheckInterval = null;
    }

    // Initialize notifiedPasses from localStorage if it exists
    const savedNotifiedPasses = localStorage.getItem('notifiedPasses');
    if (savedNotifiedPasses) {
        const parsedPasses = JSON.parse(savedNotifiedPasses);
        notifiedPasses = new Map(parsedPasses.map(pass => [pass.id, pass]));
    }

    // Check if permission is already granted
    if (Notification.permission === "granted") {
        notificationsEnabled = true;
        startNotificationCheck();
    } else if (Notification.permission !== "denied") {
        // Request permission
        Notification.requestPermission().then(permission => {
            notificationsEnabled = (permission === "granted");
            if (notificationsEnabled) {
                startNotificationCheck();
            }
        });
    }
}

// Start checking for passes that need notifications
function startNotificationCheck() {
    // Clear any existing interval
    if (notificationCheckInterval) {
        clearInterval(notificationCheckInterval);
    }
    
    // Check immediately
    checkUpcomingPassesForNotifications();
    
    // Then check every minute
    notificationCheckInterval = setInterval(checkUpcomingPassesForNotifications, 60000);
}

// Check for passes that need notifications
function checkUpcomingPassesForNotifications() {
    if (!notificationsEnabled) return;
    
    const now = new Date();
    
    // Go through all upcoming passes
    const upcomingPassesElement = document.getElementById('upcoming-passes');
    const passItems = upcomingPassesElement.querySelectorAll('.pass-item');
    
    passItems.forEach(passItem => {
        // Extract satellite info from the pass item
        const satelliteName = passItem.querySelector('.pass-satellite-name').textContent;
        const timeText = passItem.querySelector('.pass-time').textContent;
        const detailsText = passItem.querySelector('.pass-details').textContent;
        
        // Extract times (assuming format like "12:30 to 12:45")
        const timeMatch = timeText.match(/(\d+:\d+)/g);
        if (!timeMatch || timeMatch.length < 2) return;
        
        const startTimeStr = timeMatch[0];
        const endTimeStr = timeMatch[1];
        
        // Create Date objects for both start and end times
        const [startHours, startMinutes] = startTimeStr.split(':').map(Number);
        const [endHours, endMinutes] = endTimeStr.split(':').map(Number);
        
        const startTime = new Date(now);
        startTime.setHours(startHours, startMinutes, 0, 0);
        
        const endTime = new Date(now);
        endTime.setHours(endHours, endMinutes, 0, 0);
        
        // If the times have already passed today, they might be for tomorrow
        if (startTime < now && now.getHours() > startHours) {
            startTime.setDate(startTime.getDate() + 1);
            endTime.setDate(endTime.getDate() + 1);
        }
        
        // Calculate minutes until the pass
        const minutesUntilPass = (startTime - now) / (60 * 1000);
        
        // Check if we're within the notification threshold (15 minutes)
        if (minutesUntilPass > 0 && minutesUntilPass <= NOTIFICATION_THRESHOLD_MINUTES) {
            // Create a unique ID for this pass using the exact start timestamp for robustness
            const passId = `${satelliteName}-${startTime.getTime()}`;
            
            // Check if we've already notified for this pass
            if (!notifiedPasses.has(passId)) {
                console.log(`Showing notification for pass: ${passId}`);
                
                // Create notification using the original time strings for the body
                showPassNotification(satelliteName, startTimeStr, endTimeStr, detailsText, passId, startTime);
                
                // Mark this pass as notified using the robust ID
                notifiedPasses.set(passId, {
                    id: passId,
                    satellite: satelliteName,
                    startTime: startTimeStr, // Keep original string for reference
                    endTime: endTimeStr,   // Keep original string for reference
                    details: detailsText,
                    timestamp: now.getTime(), // When notification was triggered
                    startDateTime: startTime.getTime(), // Store actual start timestamp
                    endDateTime: endTime.getTime()     // Store actual end timestamp
                });
                
                // Save to localStorage
                localStorage.setItem('notifiedPasses', JSON.stringify([...notifiedPasses.values()]));
            }
        }
    });
    
    // Clean up old notifications
    cleanupOldNotifications();
}

// Clean up old notification entries
function cleanupOldNotifications() {
    const now = new Date();
    
    // Remove notifications for passes that have ended
    for (const [passId, passData] of notifiedPasses) {
        if (now.getTime() > passData.endDateTime) {
            notifiedPasses.delete(passId);
        }
    }
    
    // Save updated set to localStorage
    localStorage.setItem('notifiedPasses', JSON.stringify([...notifiedPasses.values()]));
}

// Show a notification for an upcoming pass
function showPassNotification(satellite, startTime, endTime, details, passId, actualStartTime) {
    if (!notificationsEnabled) return;
    
    // Extract max elevation from details text
    let maxElevation = "unknown";
    const elevationMatch = details.match(/Max Elevation: (\d+)°/);
    if (elevationMatch && elevationMatch[1]) {
        maxElevation = elevationMatch[1] + "°";
    }
    
    // Extract duration from details text
    let duration = "unknown";
    const durationMatch = details.match(/Duration: (\d+) min/);
    if (durationMatch && durationMatch[1]) {
        duration = durationMatch[1] + " min";
    }
    
    // Create the notification
    const options = {
        body: `Pass from ${startTime} to ${endTime}\nDuration: ${duration}, Max Elevation: ${maxElevation}`,
        icon: '/zenith.ico', // Changed icon path
        tag: passId,
        requireInteraction: true  // Keep notification visible until user dismisses it
    };
    
    const notification = new Notification(`Upcoming Pass: ${satellite}`, options);
    
    // Add click handler to focus the app
    notification.onclick = function() {
        window.focus();
        
        // Highlight the satellite
        highlightSatellite(satellite);
        
        // Close notification
        this.close();
    };
    
    // Schedule automatic closing of notification after the pass ends
    // Add 5 minutes to account for potential delays
    const now = new Date();
    const endTimeDate = new Date(actualStartTime);
    
    // Parse duration and add to end time
    if (durationMatch && durationMatch[1]) {
        endTimeDate.setMinutes(endTimeDate.getMinutes() + parseInt(durationMatch[1]) + 5);
        
        // Schedule notification cleanup
        setTimeout(() => {
            if (notification) {
                notification.close();
            }
            
            // Remove from notified passes
            if (notifiedPasses.has(passId)) {
                notifiedPasses.delete(passId);
                localStorage.setItem('notifiedPasses', JSON.stringify([...notifiedPasses.values()]));
            }
        }, endTimeDate - now);
    }
}

// Add notification functionality to the document ready function
document.addEventListener('DOMContentLoaded', () => {
    
    // Add notification toggle to settings
    const optionsForm = document.querySelector('#options-form');
    if (optionsForm) {
        const notificationsDiv = document.createElement('div');
        notificationsDiv.className = 'options-section';
        notificationsDiv.innerHTML = `
            <h3>Notifications</h3>
            <div class="form-group">
                <label for="enable-notifications">Enable pass notifications:</label>
                <input type="checkbox" id="enable-notifications">
                <span class="help-text">Get notified ${NOTIFICATION_THRESHOLD_MINUTES} minutes before a pass</span>
            </div>
        `;
        
        optionsForm.appendChild(notificationsDiv);
        
        // Add event listener for the notification toggle
        document.getElementById('enable-notifications').addEventListener('change', function() {
            if (this.checked) {
                initNotifications();
            } else {
                notificationsEnabled = false;
                if (notificationCheckInterval) {
                    clearInterval(notificationCheckInterval);
                    notificationCheckInterval = null;
                }
            }
            
            // Save setting
            localStorage.setItem('notificationsEnabled', notificationsEnabled.toString());
        });
        
        // Load setting from local storage
        const savedNotificationsEnabled = localStorage.getItem('notificationsEnabled');
        if (savedNotificationsEnabled === 'true') {
            document.getElementById('enable-notifications').checked = true;
            initNotifications();
        }
    }
});

// Add an event listener for the test notification button
document.addEventListener('DOMContentLoaded', () => {
    
    // Test notification button
    const testNotificationBtn = document.getElementById('test-notification');
    if (testNotificationBtn) {
        testNotificationBtn.addEventListener('click', showTestNotification);
    }
    
});

// Function to show a test notification
function showTestNotification() {
    // First check if notifications are enabled/available
    if (!("Notification" in window)) {
        alert("This browser does not support desktop notifications");
        return;
    }
    
    // Check if permission is already granted
    if (Notification.permission === "granted") {
        // Show a test notification
        createTestNotification();
    } else if (Notification.permission !== "denied") {
        // Request permission
        Notification.requestPermission().then(permission => {
            if (permission === "granted") {
                createTestNotification();
            } else {
                alert("Notification permission denied. Please enable notifications in your browser settings.");
            }
        });
    } else {
        // Permission was previously denied
        alert("Notification permission was denied. Please enable notifications in your browser settings.");
    }
}

// Create and show a test notification
function createTestNotification() {
    // Get the current time plus 15 minutes for the demo
    const now = new Date();
    const passTime = new Date(now.getTime() + 15 * 60000);
    const hours = passTime.getHours().toString().padStart(2, '0');
    const minutes = passTime.getMinutes().toString().padStart(2, '0');
    const startTimeStr = `${hours}:${minutes}`;
    
    // End time 10 minutes later
    const endTime = new Date(passTime.getTime() + 10 * 60000);
    const endHours = endTime.getHours().toString().padStart(2, '0');
    const endMinutes = endTime.getMinutes().toString().padStart(2, '0');
    const endTimeStr = `${endHours}:${endMinutes}`;
    
    // Notification options
    const options = {
        body: `Pass from ${startTimeStr} to ${endTimeStr}\nDuration: 10 min, Max Elevation: 45°`,
        icon: '/zenith.ico', // Changed icon path
        requireInteraction: true  // Keep notification visible until user dismisses it
    };
    
    // Create the notification
    const notification = new Notification('Test: Upcoming Pass: ISS', options);
    
    // Add click handler to focus the app
    notification.onclick = function() {
        window.focus();
        this.close();
        
        // Show a confirmation that the notification works
        alert('Success! Notifications are working correctly.');
    };
    
    // Auto-close after 10 seconds to avoid user confusion
    setTimeout(() => {
        notification.close();
    }, 10000);
}