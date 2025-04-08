# Zenith Satellite Tracker

A modern web-based satellite tracking application designed for amateur radio operators and satellite enthusiasts. Zenith provides real-time satellite tracking, pass predictions, and radio integration features.

## Features

- **Real-time Satellite Tracking**
  - Interactive world map with satellite positions
  - Satellite footprints and ground tracks
  - Detailed satellite information panels
  - Polar radar visualization for pass analysis

- **Pass Predictions**
  - Upcoming pass list with detailed timing
  - Schedule view with customizable time periods
  - Minimum elevation filtering
  - Pass notifications (optional)

- **Sked Planning**
  - Find mutual visibility windows with other stations
  - Grid square-based location input
  - Customizable elevation and time period filters
  - Detailed pass information for both stations

- **Radio Integration**
  - [CSN Technologies S.A.T](http://www.csntechnologies.net/sat) integration for automatic antenna tracking
  - Radio control panel with VFO management
  - Transponder information display
  - CTCSS tone selection

- **APRS Integration**
  - APRS message interface
  - Pre-defined message macros
  - Position reporting
  - Message history tracking

- **Roves Integration**
  - [Hams.at](https://hams.at/) API integration for rover activations
  - Upcoming roves display
  - Direct links to Hams.at for detailed information

## Requirements

- **Web Server**
  - PHP 7.4 or higher
  - SSL/TLS certificate (required for geolocation and notifications)
  - Web server (Apache, Nginx, etc.)

- **Client-side**
  - Modern web browser with JavaScript enabled
  - SSL/TLS connection (required for geolocation and notifications)

## Deployment Options

### Local Network Deployment (Recommended for CSN S.A.T Integration)
- Ideal for use with [CSN Technologies S.A.T](http://www.csntechnologies.net/sat)
- Can be run on a local server (e.g., Raspberry Pi)
- Allows direct communication with S.A.T on the local network
- Recommended setup:
  - Install on a local server within the same network as your S.A.T
  - Configure local SSL certificate
  - Access via local network IP address or hostname

### Internet Deployment
- Suitable for remote access
- Requires public SSL certificate
- May require additional configuration for S.A.T integration

## Getting Started

1. **Server Setup**
   - Install a web server (Apache, Nginx, etc.)
   - Install PHP 7.4 or higher
   - Configure SSL/TLS certificate
   - Place the application files in your web server's document root
   - Ensure PHP has write permissions for any data directories

2. **Installation**
   - Clone the repository to your web server
   - Configure your web server to serve the application over HTTPS
   - Access the application through your web browser using HTTPS

3. **Configuration**
   - Click the "Options" button to configure:
     - Your location (latitude/longitude or grid square)
     - Satellite selection
     - Radio settings
     - API keys ([Hams.at](https://hams.at/), Cloudlog)
     - Notification preferences

4. **Basic Usage**
   - Browse the map to see satellite positions
   - View upcoming passes in the sidebar
   - Click on satellites for detailed information
   - Use the schedule view for pass planning
   - Configure radio integration if available

## Dependencies

- **Server-side**
  - PHP 7.4 or higher
  - Web server with SSL/TLS support

- **Client-side**
  - Leaflet.js (1.9.4) - Interactive maps
  - Satellite.js (4.0.0) - Satellite position calculations
  - jQuery (3.7.1) - DOM manipulation
  - DataTables - Table management

## Browser Support

Zenith is designed to work in modern web browsers including:
- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

Note: Due to the use of HTML5 features like geolocation and notifications, the application must be served over HTTPS.

## Support

Zenith is primarily maintained by a single developer. Please keep this in mind when seeking support:

- **GitHub Issues**
  - Should only be used for reporting bugs or code-related issues
  - Server setup and configuration questions should not be posted as issues
  - Feature requests are welcome but may take time to implement

- **Limited Support**
  - No guaranteed response time for issues or questions
  - Server setup and configuration support is limited
  - Users are encouraged to help each other in the community

- **Community Support**
  - Consider asking for help in amateur radio forums or communities
  - Share your setup experiences with other users
  - Document and share solutions you discover

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

[Add your license information here]

## Acknowledgments

- AMSAT for satellite information
- [Hams.at](https://hams.at/) for rover data
- [CSN Technologies](http://www.csntechnologies.net/sat) for S.A.T integration
- All contributors and users of the project
