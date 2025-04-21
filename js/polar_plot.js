// Polar radar chart instance
let polarRadarChart = null;

// Initialize polar radar chart
function initPolarRadarChart() {
    const canvas = document.getElementById('polar-radar-chart');
    const ctx = canvas.getContext('2d');

    // Dynamically set canvas dimensions to match parent container
    const parent = canvas.parentElement;
    canvas.width = parent.offsetWidth;
    canvas.height = parent.offsetHeight;

    function drawCompassFace() {
        const width = canvas.width;
        const height = canvas.height;
        const centerX = width / 2;
        const centerY = height / 2;
        let radius = Math.min(centerX, centerY) - 30;

        // Ensure radius is non-negative
        if (radius <= 0) {
            console.warn('Canvas dimensions are too small to draw the compass.');
            return;
        }

        // Clear canvas
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, width, height);

        // Draw outer compass ring
        ctx.beginPath();
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 3;
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.stroke();

        // Draw cardinal and intercardinal points
        const directions = [
            { label: 'N', angle: 0, isCardinal: true },
            { label: 'NE', angle: 45, isCardinal: false },
            { label: 'E', angle: 90, isCardinal: true },
            { label: 'SE', angle: 135, isCardinal: false },
            { label: 'S', angle: 180, isCardinal: true },
            { label: 'SW', angle: 225, isCardinal: false },
            { label: 'W', angle: 270, isCardinal: true },
            { label: 'NW', angle: 315, isCardinal: false }
        ];

        directions.forEach(dir => {
            const angleRad = (dir.angle - 90) * Math.PI / 180;
            ctx.beginPath();
            ctx.strokeStyle = dir.isCardinal ? '#333' : '#666';
            ctx.lineWidth = dir.isCardinal ? 2 : 1;
            ctx.moveTo(centerX, centerY);
            ctx.lineTo(
                centerX + radius * Math.cos(angleRad),
                centerY + radius * Math.sin(angleRad)
            );
            ctx.stroke();

            ctx.fillStyle = dir.isCardinal ? '#333' : '#666';
            ctx.font = `${dir.isCardinal ? 'bold' : 'normal'} ${dir.isCardinal ? 16 : 14}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const labelRadius = radius + 20;
            ctx.fillText(
                dir.label,
                centerX + labelRadius * Math.cos(angleRad),
                centerY + labelRadius * Math.sin(angleRad)
            );
        });
        
        // Draw degree markings every 15 degrees
        for (let deg = 0; deg < 360; deg += 15) {
            // Skip where we already have cardinal/intercardinal labels
            if (deg % 45 !== 0) {
                const angleRad = (deg - 90) * Math.PI / 180;
                const markerLength = 10;
                
                // Draw degree marker
                ctx.beginPath();
                ctx.strokeStyle = '#666';
                ctx.lineWidth = 1;
                const markerStart = radius - markerLength;
                ctx.moveTo(
                    centerX + radius * Math.cos(angleRad),
                    centerY + radius * Math.sin(angleRad)
                );
                ctx.lineTo(
                    centerX + markerStart * Math.cos(angleRad),
                    centerY + markerStart * Math.sin(angleRad)
                );
                ctx.stroke();
                
                // Add degree label
                ctx.fillStyle = '#666';
                ctx.font = '12px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const textRadius = radius + 14;
                ctx.fillText(
                    `${deg}°`,
                    centerX + textRadius * Math.cos(angleRad),
                    centerY + textRadius * Math.sin(angleRad)
                );
            }
        }

        // Draw elevation circles every 10 degrees from horizon to zenith
        for (let el = 10; el < 90; el += 10) {
            const circleRadius = radius * (1 - el/90);
            ctx.beginPath();
            ctx.strokeStyle = el % 30 === 0 ? '#666' : '#999';
            ctx.lineWidth = el % 30 === 0 ? 1 : 0.5;
            ctx.setLineDash([2, 2]);
            ctx.arc(centerX, centerY, circleRadius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);

            // Add elevation labels on east side
            if (el % 30 === 0) {
                ctx.fillStyle = '#666';
                ctx.font = '12px Arial';
                ctx.textAlign = 'left';
                ctx.fillText(
                    el + '°',
                    centerX + circleRadius + 5,
                    centerY
                );
            }
        }
    }

    function drawPassTrack(points) {
        const width = canvas.width;
        const height = canvas.height;
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(centerX, centerY) - 30;

        if (points && points.length > 0) {
            // Draw the path
            ctx.beginPath();
            ctx.strokeStyle = '#4a76ce';
            ctx.lineWidth = 2.5;

            points.forEach((point, index) => {
                // Convert from polar to cartesian coordinates
                const r = radius * (1 - point.elevation/90);
                const angle = (point.azimuth - 90) * Math.PI / 180;
                const x = centerX + r * Math.cos(angle);
                const y = centerY + r * Math.sin(angle);

                if (index === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            });
            
            ctx.stroke();

            // Draw start and end points
            const start = points[0];
            const end = points[points.length - 1];

            // Draw start point (green) with AOS label
            const startR = radius * (1 - start.elevation/90);
            const startAngle = (start.azimuth - 90) * Math.PI / 180;
            const startX = centerX + startR * Math.cos(startAngle);
            const startY = centerY + startR * Math.sin(startAngle);
            
            ctx.beginPath();
            ctx.fillStyle = '#4CAF50';
            ctx.arc(startX, startY, 5, 0, Math.PI * 2);
            ctx.fill();
            
            // Add AOS label
            ctx.fillStyle = '#4CAF50';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            // Position the label slightly offset from the point
            const aosLabelX = startX + (startX > centerX ? -10 : 10);
            const aosLabelY = startY + (startY > centerY ? -10 : 10);
            ctx.fillText('AOS', aosLabelX, aosLabelY);

            // Draw end point (red) with LOS label
            const endR = radius * (1 - end.elevation/90);
            const endAngle = (end.azimuth - 90) * Math.PI / 180;
            const endX = centerX + endR * Math.cos(endAngle);
            const endY = centerY + endR * Math.sin(endAngle);
            
            ctx.beginPath();
            ctx.fillStyle = '#f44336';
            ctx.arc(endX, endY, 5, 0, Math.PI * 2);
            ctx.fill();
            
            // Add LOS label
            ctx.fillStyle = '#f44336';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            // Position the label slightly offset from the point
            const losLabelX = endX + (endX > centerX ? -10 : 10);
            const losLabelY = endY + (endY > centerY ? -10 : 10);
            ctx.fillText('LOS', losLabelX, losLabelY);
        }
    }

    canvas.addEventListener('mousemove', function(event) {
        const rect = canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = Math.min(centerX, centerY) - 30;

        // Calculate distance from center
        const dx = mouseX - centerX;
        const dy = mouseY - centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance <= radius) {
            // Calculate azimuth (0° at North, clockwise)
            let azimuth = Math.atan2(dx, -dy) * 180 / Math.PI;
            if (azimuth < 0) azimuth += 360;

            // Calculate elevation (90° at center, 0° at edge)
            const elevation = 90 * (1 - distance/radius);

            canvas.title = `Az: ${azimuth.toFixed(1)}°, El: ${elevation.toFixed(1)}°`;
        } else {
            canvas.title = '';
        }
    });

    return {
        draw: (points) => {
            drawCompassFace();
            if (points && points.length > 0) {
                drawPassTrack(points);
            }
        }
    };
}

// Show the polar radar chart for a pass
function showPolarRadarForPass(pass) {
    if (!polarRadarChart) {
        polarRadarChart = initPolarRadarChart();
    }

    // Ensure the panel is visible before setting dimensions
    const panel = document.getElementById('polar-radar-panel');
    panel.style.display = 'block';

    // Dynamically resize the canvas to match the parent container
    const canvas = document.getElementById('polar-radar-chart');
    const parent = canvas.parentElement;
    canvas.width = parent.offsetWidth;
    canvas.height = parent.offsetHeight;

    // Check if dimensions are valid
    if (canvas.width <= 0 || canvas.height <= 0) {
        console.error('Canvas dimensions are invalid. Ensure the parent container has proper dimensions.');
        return;
    }

    // Get pass points
    const points = calculatePassPoints(pass);

    // Draw the chart
    polarRadarChart.draw(points);

    // Set chart title
    document.getElementById('polar-radar-title').textContent = `${pass.satellite} Pass Track`;
}

// Calculate points along the pass for visualization
function calculatePassPoints(pass) {
    const points = [];
    const numPoints = 50; // Number of points to calculate
    
    try {
        const satrec = satellite.twoline2satrec(
            window.tleData[pass.satellite].tle1,
            window.tleData[pass.satellite].tle2
        );
        
        // Convert observer coordinates to radians
        const observerGd = {
            latitude: observer.latitude * Math.PI / 180,
            longitude: observer.longitude * Math.PI / 180,
            height: observer.elevation / 1000 // km
        };
        
        // Calculate points along the pass
        for (let i = 0; i < numPoints; i++) {
            const time = new Date(pass.start.getTime() + (i / (numPoints - 1)) * (pass.end - pass.start));
            
            const positionAndVelocity = satellite.propagate(satrec, time);
            if (!positionAndVelocity.position) continue;
            
            const gmst = satellite.gstime(time);
            const positionEcf = satellite.eciToEcf(positionAndVelocity.position, gmst);
            const lookAngles = satellite.ecfToLookAngles(observerGd, positionEcf);
            
            if (lookAngles.elevation >= 0) { // Only include points above horizon
                points.push({
                    azimuth: (lookAngles.azimuth * 180 / Math.PI + 360) % 360,
                    elevation: lookAngles.elevation * 180 / Math.PI
                });
            }
        }
    } catch (error) {
        console.error('Error calculating pass points:', error);
    }
    
    return points;
}

// Update the pass item click handler to show the polar radar
document.addEventListener('DOMContentLoaded', () => {
    // ... existing event listeners ...

    // Add close button handler for polar radar
    document.getElementById('close-polar-radar').addEventListener('click', () => {
        document.getElementById('polar-radar-panel').style.display = 'none';
    });
});