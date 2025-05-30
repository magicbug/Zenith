# Zenith Satellite Tracker

![zenith_screenshot](https://github.com/user-attachments/assets/8ba8df6f-4b2e-4b9a-9711-ddaf4b94568d)

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
  - [CSN Technologies S.A.T](http://www.csntechnologies.net/sat) integration for automatic radio control & antenna tracking
      - Radio control panel with VFO management
      - Transponder information display
      - CTCSS tone selection
  - QTRigDoppler integration for advanced radio and rotator control
      - Satellite and transponder selection
      - Frequency and mode display
      - RX offset and subtone control
      - Rotator parking and stop functions
  - Cloudlog API integration for automatic QSO logging

- **APRS Integration**
  - APRS message interface
  - Pre-defined message macros
  - Position reporting
  - Message history tracking
  - APRS panel for sending/receiving messages, CQ, and position
  - WebSocket server configuration in Options
  - Requires [Zenith APRS](https://github.com/magicbug/zenith_aprs) for full functionality (see its documentation)

- **Roves Integration**
  - [Hams.at](https://hams.at/) API integration for rover activations
  - Upcoming roves display
  - Direct links to [Hams.at](https://hams.at/) for detailed information

- **Partner View**
  - Visualize a contact's grid square and elevation overlay on the map
  - Enter partner grid and label for real-time visualization

- **Manual TLE Input**
  - Add or update satellites by pasting 3-line TLE data
  - Access via the Satellites tab in Options

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
     - QTRigDoppler and CSN S.A.T server addresses
     - APRS WebSocket server and port
     
   - Use the "Input TLEs Manually" button in the Satellites tab to add custom satellites

4. **Basic Usage**
   - Browse the map to see satellite positions
   - View upcoming passes in the sidebar
   - Click on satellites for detailed information
   - Use the schedule view for pass planning
   - Configure radio integration if available
   - Use the QTRigDoppler panel for advanced radio/rotator control
   - Use the APRS panel to send/receive APRS messages and position reports
   - Use Partner View to visualize a contact's grid and elevation
   - Log QSOs automatically to Cloudlog if enabled
   - Add custom satellites using manual TLE input

## Dependencies

- **Server-side**
  - PHP 7.4 or higher
  - Web server with SSL/TLS support

- **Client-side**
  - D3.js - Interactive map visualization
  - Satellite.js (4.0.0) - Satellite position calculations
  - jQuery (3.7.1) - DOM manipulation
  - DataTables - Table management

## Browser Support

Zenith is designed to work in modern web browsers including:
- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

Note: The application must be served over HTTPS due to the use of HTML5 features like geolocation and notifications.

**Device Support:**
- Currently optimized for desktop/laptop computers
- Tablet and mobile device support coming in a future update
- Some features may not work optimally on touch devices at this time

## Support

Zenith is primarily maintained by a single developer. Please keep this in mind when seeking support:

- **GitHub Issues**
  - Should only be used for reporting bugs or code-related issues
  - Server setup and configuration questions should not be posted as issues
  - Feature requests are welcome but may take time to implement

- **GitHub Discussions**
  - Primary platform for community support
  - Ask questions about setup and configuration
  - Share your experiences and solutions
  - Help other users with their questions
  - Visit [GitHub Discussions](https://github.com/magicbug/Zenith/discussions) to join the community

- **Limited Support**
  - No guaranteed response time for issues or questions
  - Server setup and configuration support is limited
  - Users are encouraged to help each other in the community

- **Community Support**
  - Consider asking for help in amateur radio forums or communities
  - Share your setup experiences with other users
  - Document and share solutions you discover

## Contributing

Contributions are welcome, but please follow these guidelines to help manage the project effectively:

- **Before Starting Work**
  - Open a discussion to discuss your proposed changes
  - Wait for confirmation before starting significant work
  - Check if similar work is already in progress

- **Pull Request Guidelines**
  - Keep PRs focused and limited to one feature/fix
  - Include clear descriptions of changes
  - Update documentation as needed
  - Ensure code follows existing style and patterns
  - Test changes thoroughly before submitting

- **Response Time**
  - No guaranteed response time for PR reviews
  - Complex PRs may take longer to review
  - Be prepared to make requested changes

- **Scope Limitations**
  - Major architectural changes require prior discussion
  - New dependencies must be justified
  - Backward compatibility should be maintained
  - Mobile/tablet support is planned for future updates

- **Code Quality**
  - Follow existing code style
  - Include comments for complex logic
  - Write clear commit messages
  - Ensure all tests pass

Remember that Zenith is maintained by a single developer in their spare time. Your patience and understanding are appreciated.

## License

Zenith Satellite Tracker is licensed under the GNU Affero General Public License (AGPL) v3. This means:

- You are free to use, modify, and distribute the software
- Any modifications must be shared under the same license
- If you host a modified version as a service, you must make the source code available
- Commercial use is allowed but the source must remain open
- You cannot take this code and sell it as a proprietary product

For more information, see the [full license text](LICENSE) or visit [gnu.org/licenses/agpl-3.0](https://www.gnu.org/licenses/agpl-3.0).

## Acknowledgments

- AMSAT for satellite information
- [Hams.at](https://hams.at/) for rover data
- [CSN Technologies](http://www.csntechnologies.net/sat) for S.A.T integration
- All contributors and users of the project

## Support the Project

Zenith is completely free and open source, built with passion for the amateur radio community. If you find this project useful and would like to support its continued development, consider sponsoring me on GitHub. Your support helps maintain and improve Zenith, as well as my other open source projects.

[![Sponsor me on GitHub](https://img.shields.io/badge/Sponsor%20me%20on%20GitHub-%23EA4AAA?style=for-the-badge&logo=github)](https://github.com/sponsors/magicbug)

Every contribution, no matter the size, is greatly appreciated and helps ensure the future of Zenith and other open source tools for the amateur radio community.
