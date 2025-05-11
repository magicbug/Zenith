// Schedule functionality
let allScheduledPasses = [];
let SCHEDULE_PREDICTION_DAYS = 1;

// Add event listeners for Schedule modal
document.addEventListener('DOMContentLoaded', () => {

    // Initialize Schedule Modal
    const scheduleModal = document.getElementById('schedule-modal');
    const openScheduleBtn = document.getElementById('open-schedule');
    const scheduleCloseBtn = document.querySelector('.schedule-close');
    const refreshScheduleBtn = document.getElementById('refresh-schedule');
    const scheduleDaysSelect = document.getElementById('schedule-days');
    const satelliteFilterSelect = document.getElementById('schedule-satellite-filter');

    // Schedule Modal open/close functionality
    openScheduleBtn.addEventListener('click', () => {
        scheduleModal.style.display = 'block';
        populateSatelliteFilter();
        generateScheduleTable();
    });

    scheduleCloseBtn.addEventListener('click', () => {
        scheduleModal.style.display = 'none';
    });

    // Close schedule modal if clicked outside
    window.addEventListener('click', (e) => {
        if (e.target === scheduleModal) {
            scheduleModal.style.display = 'none';
        }
    });

    // Event listeners for schedule controls
    satelliteFilterSelect.addEventListener('change', filterScheduleTable);
    scheduleDaysSelect.addEventListener('change', () => {
        SCHEDULE_PREDICTION_DAYS = parseInt(scheduleDaysSelect.value);
        generateScheduleTable();
    });
    refreshScheduleBtn.addEventListener('click', generateScheduleTable);
});

// Populate the satellite filter dropdown
function populateSatelliteFilter() {
    const satelliteFilterSelect = document.getElementById('schedule-satellite-filter');
    
    // Clear existing options except "All Satellites"
    while (satelliteFilterSelect.options.length > 1) {
        satelliteFilterSelect.remove(1);
    }

    // Add selected satellites to dropdown
    selectedSatellites.forEach(satName => {
        const option = document.createElement('option');
        option.value = satName;
        option.textContent = satName;
        satelliteFilterSelect.appendChild(option);
    });
}

// Generate the schedule table with all upcoming passes
function generateScheduleTable() {
    const tableBody = document.getElementById('pass-schedule-body');
    tableBody.innerHTML = ''; // Clear existing rows
    
    // Show loading message
    tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Loading pass schedule...</td></tr>';
    
    // Get the prediction period in days
    const days = parseInt(document.getElementById('schedule-days').value) || 1;
    
    // Calculate passes for all selected satellites
    const now = new Date();
    const endTime = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    allScheduledPasses = [];
    
    if (selectedSatellites.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">No satellites selected</td></tr>';
        return;
    }
    
    // For each satellite, predict passes
    selectedSatellites.forEach(satName => {
        if (!window.tleData[satName]) return;
        
        try {
            const sat = window.tleData[satName];
            const satrec = satellite.twoline2satrec(sat.tle1, sat.tle2);
            
            // Predict passes
            const satPasses = predictPasses(satrec, observer, now, endTime);
            
            satPasses.forEach(pass => {
                allScheduledPasses.push({
                    satellite: satName,
                    start: pass.start,
                    end: pass.end,
                    maxElevation: pass.maxElevation,
                    duration: Math.round((pass.end - pass.start) / (60 * 1000)) // Duration in minutes
                });
            });
        } catch (error) {
            console.error(`Error calculating passes for ${satName}:`, error);
        }
    });
    
    // Sort passes by start time
    allScheduledPasses.sort((a, b) => a.start - b.start);
    
    // Display passes
    if (allScheduledPasses.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center;">No passes found in the next ${days} day(s)</td></tr>`;
        return;
    }
    
    // Apply the current filter
    filterScheduleTable();
}

// Filter the schedule table based on selected satellite
function filterScheduleTable() {
    const tableBody = document.getElementById('pass-schedule-body');
    tableBody.innerHTML = ''; // Clear existing rows
    
    const satelliteFilter = document.getElementById('schedule-satellite-filter').value;
    const now = new Date();
    
    // Filter passes by selected satellite
    const filteredPasses = satelliteFilter === 'all' 
        ? allScheduledPasses 
        : allScheduledPasses.filter(pass => pass.satellite === satelliteFilter);
    
    // Sort by start time
    filteredPasses.sort((a, b) => a.start - b.start);
    
    // Display filtered passes
    filteredPasses.forEach(pass => {
        const row = document.createElement('tr');
        
        // Check pass status
        const isActive = now >= pass.start && now <= pass.end;
        const timeToPass = (pass.start - now) / (60 * 1000); // Time to pass in minutes
        const isUpcoming = !isActive && timeToPass > 0 && timeToPass <= 60; // Within next hour
        const isWithinFootprint = isSatelliteWithinFootprint(pass.satellite);
        
        // Set row class based on pass status
        if (isActive) {
            row.classList.add('pass-active');
        } else if (isUpcoming) {
            row.classList.add('pass-upcoming');
        } else if (isWithinFootprint) {
            row.classList.add('pass-visible');
        }
        
        // Format dates
        const startDateTime = formatDateTimeWithDate(pass.start);
        const endDateTime = formatDateTimeWithDate(pass.end);
        const status = getPassStatusLabel(pass, now);
        
        // Create row cells
        row.innerHTML = `
            <td>${pass.satellite}</td>
            <td>${startDateTime}</td>
            <td>${endDateTime}</td>
            <td>${Math.round(pass.maxElevation)}°</td>
            <td>${pass.duration} min</td>
            <td>${status}</td>
        `;
        
        // Add click handler to show satellite info
        row.addEventListener('click', () => {
            const satName = pass.satellite;
            const position = getSatellitePosition(satName);
            if (position) {
                showSatelliteInfo(satName);
                showPolarRadarForPass(pass);
                
                // Attempt to select the satellite in QTRigDoppler if it's enabled
                if (typeof selectSatelliteInQTRigDoppler === 'function') {
                    selectSatelliteInQTRigDoppler(satName);
                }
            }
            
            // Close the schedule modal
            document.getElementById('schedule-modal').style.display = 'none';
        });
        
        tableBody.appendChild(row);
    });
    
    // If no passes match filter
    if (filteredPasses.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = `<td colspan="6" style="text-align: center;">No passes found for ${satelliteFilter}</td>`;
        tableBody.appendChild(row);
    }
}

// Format date and time for display with date included
function formatDateTimeWithDate(date) {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const isToday = date.getDate() === now.getDate() && 
                    date.getMonth() === now.getMonth() && 
                    date.getFullYear() === now.getFullYear();
                    
    const isTomorrow = date.getDate() === tomorrow.getDate() && 
                      date.getMonth() === tomorrow.getMonth() && 
                      date.getFullYear() === tomorrow.getFullYear();
    
    const day = isToday ? 'Today' : 
               isTomorrow ? 'Tomorrow' : 
               `${date.getDate()}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear().toString().substring(2)}`;
               
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    
    return `${day} ${hours}:${minutes}`;
}

// Get a styled status label for a pass
function getPassStatusLabel(pass, now) {
    const isActive = now >= pass.start && now <= pass.end;
    const timeToPass = (pass.start - now) / (60 * 1000); // Time to pass in minutes
    const isUpcoming = !isActive && timeToPass > 0 && timeToPass <= 60; // Within next hour
    const isWithinFootprint = isSatelliteWithinFootprint(pass.satellite);
    
    if (isActive) {
        return '<span class="status-label status-active">Active</span>';
    } else if (isUpcoming) {
        return '<span class="status-label status-upcoming">Upcoming</span>';
    } else if (isWithinFootprint) {
        return '<span class="status-label status-visible">Visible</span>';
    } else {
        return '<span class="status-label status-normal">Scheduled</span>';
    }
}

// Add event listeners for Sked Planning modal
document.addEventListener('DOMContentLoaded', () => {
    // Initialize Sked Planning Modal
    const skedPlanningModal = document.getElementById('sked-planning-modal');
    const openSkedPlanningBtn = document.getElementById('open-sked-planning');
    const skedPlanningCloseBtn = document.querySelector('.sked-planning-close');
    const refreshSkedPlanningBtn = document.getElementById('refresh-sked-planning');
    const skedDaysSelect = document.getElementById('sked-days');
    const skedSatelliteFilterSelect = document.getElementById('sked-satellite-filter');
    const skedMinElevationSelect = document.getElementById('sked-min-elevation');
    const skedObserver2Grid = document.getElementById('sked-observer2-grid');
    const skedObserver2Coords = document.getElementById('sked-observer2-coords');

    // Sked Planning Modal open/close functionality
    openSkedPlanningBtn.addEventListener('click', () => {
        skedPlanningModal.style.display = 'block';
        populateSkedSatelliteFilter();
        skedObserver2Grid.value = observer2.gridSquare || '';
        updateGridSquareCoords();
    });

    skedPlanningCloseBtn.addEventListener('click', () => {
        skedPlanningModal.style.display = 'none';
    });

    // Close sked planning modal if clicked outside
    window.addEventListener('click', (e) => {
        if (e.target === skedPlanningModal) {
            skedPlanningModal.style.display = 'none';
        }
    });

    // Grid square input handler
    skedObserver2Grid.addEventListener('input', () => {
        const gridSquare = skedObserver2Grid.value.trim();
        observer2.gridSquare = gridSquare;
        updateGridSquareCoords();
    });

    // Event listeners for sked planning controls
    skedSatelliteFilterSelect.addEventListener('change', filterSkedPlanningTable);
    skedDaysSelect.addEventListener('change', () => {
        SKED_PREDICTION_DAYS = parseInt(skedDaysSelect.value);
    });
    skedMinElevationSelect.addEventListener('change', () => {
        SKED_MIN_ELEVATION = parseInt(skedMinElevationSelect.value);
    });
    refreshSkedPlanningBtn.addEventListener('click', generateSkedPlanningTable);
});

// Populate the sked planning satellite filter dropdown
function populateSkedSatelliteFilter() {
    const satelliteFilterSelect = document.getElementById('sked-satellite-filter');
    
    // Clear existing options except "All Satellites"
    while (satelliteFilterSelect.options.length > 1) {
        satelliteFilterSelect.remove(1);
    }

    // Add selected satellites to dropdown
    selectedSatellites.forEach(satName => {
        const option = document.createElement('option');
        option.value = satName;
        option.textContent = satName;
        satelliteFilterSelect.appendChild(option);
    });
}

// Convert Maidenhead grid square to lat/lon
function gridSquareToLatLon(gridSquare) {
    if (!gridSquare || gridSquare.length < 4) {
        return { latitude: 0, longitude: 0 };
    }
    
    gridSquare = gridSquare.toUpperCase();
    
    // Basic validation - grid squares must be an even length of 2-8 characters
    if (gridSquare.length % 2 !== 0 || gridSquare.length > 8) {
        console.error('Invalid grid square format');
        return { latitude: 0, longitude: 0 };
    }
    
    try {
        // First pair (letters): 20° increments
        let longitude = (gridSquare.charCodeAt(0) - 65) * 20 - 180;
        let latitude = (gridSquare.charCodeAt(1) - 65) * 10 - 90;
        
        // Second pair (numbers): 2° and 1° increments
        if (gridSquare.length >= 4) {
            longitude += parseInt(gridSquare.charAt(2)) * 2;
            latitude += parseInt(gridSquare.charAt(3));
        }
        
        // Third pair (letters): 5 minute increments (0.0833°)
        if (gridSquare.length >= 6) {
            longitude += (gridSquare.charCodeAt(4) - 97) * 5 / 60;
            latitude += (gridSquare.charCodeAt(5) - 97) * 2.5 / 60;
        }
        
        // Fourth pair (numbers): 30 second and 15 second increments (0.0083°, 0.0042°)
        if (gridSquare.length === 8) {
            longitude += parseInt(gridSquare.charAt(6)) * (0.5 / 60);
            latitude += parseInt(gridSquare.charAt(7)) * (0.25 / 60);
        }
        
        // Center of the grid square
        if (gridSquare.length === 2) {
            longitude += 10;  // 20/2
            latitude += 5;    // 10/2
        } else if (gridSquare.length === 4) {
            longitude += 1;   // 2/2
            latitude += 0.5;  // 1/2
        } else if (gridSquare.length === 6) {
            longitude += 5/60/2;
            latitude += 2.5/60/2;
        } else if (gridSquare.length === 8) {
            longitude += 0.5/60/2;
            latitude += 0.25/60/2;
        }
        
        // Round to 5 decimal places (about 1 meter precision)
        longitude = Math.round(longitude * 100000) / 100000;
        latitude = Math.round(latitude * 100000) / 100000;
        
        return { latitude, longitude };
    } catch (error) {
        console.error('Error converting grid square:', error);
        return { latitude: 0, longitude: 0 };
    }
}

// Update observer2 coordinates based on grid square input
function updateGridSquareCoords() {
    const gridSquare = observer2.gridSquare;
    const coordsDisplay = document.getElementById('sked-observer2-coords');
    
    if (!gridSquare || gridSquare.length < 4) {
        coordsDisplay.textContent = 'Enter a valid grid square (e.g. IO91wm)';
        return;
    }
    
    const coords = gridSquareToLatLon(gridSquare);
    observer2.latitude = coords.latitude;
    observer2.longitude = coords.longitude;
    observer2.elevation = 0; // Default elevation
    
    coordsDisplay.textContent = `Lat: ${coords.latitude.toFixed(5)}°, Long: ${coords.longitude.toFixed(5)}°`;
}

// Generate the sked planning table with all mutual passes
function generateSkedPlanningTable() {
    const tableBody = document.getElementById('sked-planning-body');
    tableBody.innerHTML = ''; // Clear existing rows
    
    // Show loading message
    tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Finding mutual passes...</td></tr>';
    
    // Check if grid square is valid
    if (!observer2.gridSquare || observer2.gridSquare.length < 4) {
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Please enter a valid grid square</td></tr>';
        return;
    }
    
    // Get the prediction period in days
    const days = parseInt(document.getElementById('sked-days').value) || 1;
    const minElevation = parseInt(document.getElementById('sked-min-elevation').value) || 5;
    
    // Calculate passes for all selected satellites
    const now = new Date();
    const endTime = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    allSkedPasses = [];
    
    if (selectedSatellites.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">No satellites selected</td></tr>';
        return;
    }
    
    // Convert observer2 coordinates
    updateGridSquareCoords();
    
    // Create observer2 object for satellite.js
    const observer2ForSat = {
        latitude: observer2.latitude * Math.PI / 180,
        longitude: observer2.longitude * Math.PI / 180,
        height: observer2.elevation / 1000 // km
    };
    
    // Create observer1 (primary user) object for satellite.js
    const observer1ForSat = {
        latitude: observer.latitude * Math.PI / 180,
        longitude: observer.longitude * Math.PI / 180,
        height: observer.elevation / 1000 // km
    };
    
    // For each satellite, predict passes
    selectedSatellites.forEach(satName => {
        if (!window.tleData[satName]) return;
        
        try {
            const sat = window.tleData[satName];
            const satrec = satellite.twoline2satrec(sat.tle1, sat.tle2);
            
            // Predict passes for observer 1
            const passes1 = predictPassesWithMinElevation(satrec, observer1ForSat, now, endTime, minElevation);
            
            // Predict passes for observer 2
            const passes2 = predictPassesWithMinElevation(satrec, observer2ForSat, now, endTime, minElevation);
            
            // Find mutual visibility periods
            const mutualPasses = findMutualPasses(passes1, passes2, satName);
            
            // Add to all sked passes
            allSkedPasses = allSkedPasses.concat(mutualPasses);
        } catch (error) {
            console.error(`Error calculating mutual passes for ${satName}:`, error);
        }
    });
    
    // Sort passes by start time
    allSkedPasses.sort((a, b) => a.start - b.start);
    
    // Display passes
    if (allSkedPasses.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center;">No mutual passes found in the next ${days} day(s)</td></tr>`;
        return;
    }
    
    // Apply the current filter
    filterSkedPlanningTable();
}

// Find overlapping time periods for mutual visibility
function findMutualPasses(passes1, passes2, satName) {
    const mutualPasses = [];
    
    passes1.forEach(pass1 => {
        passes2.forEach(pass2 => {
            // Check for overlap
            const overlapStart = new Date(Math.max(pass1.start.getTime(), pass2.start.getTime()));
            const overlapEnd = new Date(Math.min(pass1.end.getTime(), pass2.end.getTime()));
            
            // If there's an overlap
            if (overlapStart < overlapEnd) {
                mutualPasses.push({
                    satellite: satName,
                    start: overlapStart,
                    end: overlapEnd,
                    maxElevation1: pass1.maxElevation,
                    maxElevation2: pass2.maxElevation,
                    duration: Math.round((overlapEnd - overlapStart) / (60 * 1000)) // Duration in minutes
                });
            }
        });
    });
    
    return mutualPasses;
}

// Predict satellite passes with minimum elevation filter
function predictPassesWithMinElevation(satrec, observerGd, startTime, endTime, minElevation) {
    const passes = [];
    const stepMinutes = 1; // Step size in minutes
    let currentPass = null;
    
    // Scan time period in steps
    for (let time = new Date(startTime); time <= endTime; time = new Date(time.getTime() + stepMinutes * 60 * 1000)) {
        try {
            // Get satellite position at this time
            const positionAndVelocity = satellite.propagate(satrec, time);
            
            if (!positionAndVelocity.position) {
                continue;
            }
            
            // Get look angles from observer to satellite
            const gmst = satellite.gstime(time);
            const lookAngles = satellite.ecfToLookAngles(observerGd, satellite.eciToEcf(positionAndVelocity.position, gmst));
            
            // Convert elevation to degrees
            const elevationDeg = lookAngles.elevation * 180 / Math.PI;
            
            // Check if satellite is visible above minimum elevation
            if (elevationDeg >= minElevation) {
                if (!currentPass) {
                    // Start of a new pass
                    currentPass = {
                        start: new Date(time),
                        maxElevation: elevationDeg
                    };
                } else if (elevationDeg > currentPass.maxElevation) {
                    // Update max elevation if higher
                    currentPass.maxElevation = elevationDeg;
                }
            } else if (currentPass) {
                // End of a pass
                currentPass.end = new Date(time);
                passes.push(currentPass);
                currentPass = null;
            }
        } catch (error) {
            console.error('Error in pass prediction:', error);
        }
    }
    
    // Handle a pass that might be ongoing at the end of the prediction period
    if (currentPass) {
        currentPass.end = new Date(endTime);
        passes.push(currentPass);
    }
    
    return passes;
}

// Filter the sked planning table based on selected satellite
function filterSkedPlanningTable() {
    const tableBody = document.getElementById('sked-planning-body');
    tableBody.innerHTML = ''; // Clear existing rows
    
    const satelliteFilter = document.getElementById('sked-satellite-filter').value;
    const now = new Date();
    
    // Filter passes by selected satellite
    const filteredPasses = satelliteFilter === 'all' 
        ? allSkedPasses 
        : allSkedPasses.filter(pass => pass.satellite === satelliteFilter);
    
    // Sort by start time
    filteredPasses.sort((a, b) => a.start - b.start);
    
    // Display filtered passes
    filteredPasses.forEach(pass => {
        const row = document.createElement('tr');
        
        // Check pass status
        const isActive = now >= pass.start && now <= pass.end;
        const timeToPass = (pass.start - now) / (60 * 1000); // Time to pass in minutes
        const isUpcoming = !isActive && timeToPass > 0 && timeToPass <= 60; // Within next hour
        
        // Set row class based on pass status
        if (isActive) {
            row.classList.add('pass-active');
        } else if (isUpcoming) {
            row.classList.add('pass-upcoming');
        }
        
        // Format dates
        const startDateTime = formatDateTimeWithDate(pass.start);
        const endDateTime = formatDateTimeWithDate(pass.end);
        
        // Create Google Calendar link
        const calendarLink = createGoogleCalendarLink(pass);
        
        // Create row cells
        row.innerHTML = `
            <td>${pass.satellite}</td>
            <td>${startDateTime}</td>
            <td>${endDateTime}</td>
            <td>${Math.round(pass.maxElevation1)}°</td>
            <td>${Math.round(pass.maxElevation2)}°</td>
            <td>${pass.duration} min</td>
            <td>
                <a href="${calendarLink}" target="_blank" class="calendar-link" title="Add to Google Calendar">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="16" y1="2" x2="16" y2="6"></line>
                        <line x1="8" y1="2" x2="8" y2="6"></line>
                        <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                </a>
            </td>
        `;
        
        // Add click handler to show satellite info
        row.addEventListener('click', (e) => {
            // Don't trigger if clicking the calendar link
            if (e.target.closest('.calendar-link')) {
                e.stopPropagation();
                return;
            }

            const satName = pass.satellite;
            const position = getSatellitePosition(satName);
            if (position) {
                showSatelliteInfo(satName);
                
                // Attempt to select the satellite in QTRigDoppler if it's enabled
                if (typeof selectSatelliteInQTRigDoppler === 'function') {
                    selectSatelliteInQTRigDoppler(satName);
                }
            }
            
            // Close the schedule modal
            document.getElementById('sked-planning-modal').style.display = 'none';
        });
        
        tableBody.appendChild(row);
    });
    
    // If no passes match filter
    if (filteredPasses.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = `<td colspan="7" style="text-align: center;">No mutual passes found for ${satelliteFilter}</td>`;
        tableBody.appendChild(row);
    }
}

function createGoogleCalendarLink(pass) {
    // Format dates in the required format: YYYYMMDDTHHmmssZ
    const formatDateForCalendar = (date) => {
        return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    };

    const startTime = formatDateForCalendar(pass.start);
    const endTime = formatDateForCalendar(pass.end);
    
    // Create event title and description
    const title = `Satellite Pass: ${pass.satellite}`;
    const description = `Mutual visibility pass with remote station\n` +
        `Your maximum elevation: ${Math.round(pass.maxElevation1)}°\n` +
        `Their maximum elevation: ${Math.round(pass.maxElevation2)}°\n` +
        `Duration: ${pass.duration} minutes`;
    
    // Build calendar URL
    const calendarURL = new URL('https://calendar.google.com/calendar/render');
    calendarURL.searchParams.append('action', 'TEMPLATE');
    calendarURL.searchParams.append('text', title);
    calendarURL.searchParams.append('details', description);
    calendarURL.searchParams.append('dates', `${startTime}/${endTime}`);
    
    return calendarURL.toString();
}