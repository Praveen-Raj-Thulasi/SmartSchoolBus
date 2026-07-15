-- MySQL DDL Schema for Smart School Bus Management System

CREATE DATABASE IF NOT EXISTS schoolbus_db;
USE schoolbus_db;

-- 1. Parents Table
CREATE TABLE IF NOT EXISTS parents (
    parent_id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(100) NOT NULL
);

-- 2. Drivers Table
CREATE TABLE IF NOT EXISTS drivers (
    driver_id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    license_number VARCHAR(50) NOT NULL
);

-- 3. Buses Table
CREATE TABLE IF NOT EXISTS buses (
    bus_id VARCHAR(50) PRIMARY KEY,
    bus_number VARCHAR(50) NOT NULL UNIQUE,
    capacity INT NOT NULL,
    driver_id VARCHAR(50),
    current_status VARCHAR(50) DEFAULT 'Idle',
    maintenance_status VARCHAR(50) DEFAULT 'Good',
    FOREIGN KEY (driver_id) REFERENCES drivers(driver_id) ON DELETE SET NULL
);

-- 4. Routes Table
CREATE TABLE IF NOT EXISTS routes (
    route_id VARCHAR(50) PRIMARY KEY,
    route_name VARCHAR(100) NOT NULL,
    distance VARCHAR(50) NOT NULL,
    estimated_time VARCHAR(50) NOT NULL,
    stops TEXT -- Comma separated list of stops
);

-- 5. Students Table
CREATE TABLE IF NOT EXISTS students (
    student_id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    student_class VARCHAR(50) NOT NULL, -- mapped to 'class' in JSON
    section VARCHAR(50) NOT NULL,
    parent_id VARCHAR(50) NOT NULL,
    route_id VARCHAR(50),
    bus_id VARCHAR(50),
    address VARCHAR(200) NOT NULL,
    FOREIGN KEY (parent_id) REFERENCES parents(parent_id) ON DELETE CASCADE,
    FOREIGN KEY (route_id) REFERENCES routes(route_id) ON DELETE SET NULL,
    FOREIGN KEY (bus_id) REFERENCES buses(bus_id) ON DELETE SET NULL
);

-- 6. Users Table (Authentication)
CREATE TABLE IF NOT EXISTS users (
    user_id VARCHAR(50) PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(200) NOT NULL,
    role VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    driver_id VARCHAR(50) NULL,
    parent_id VARCHAR(50) NULL,
    student_id VARCHAR(50) NULL,
    FOREIGN KEY (driver_id) REFERENCES drivers(driver_id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES parents(parent_id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE
);

-- 7. Attendance Table
CREATE TABLE IF NOT EXISTS attendance (
    attendance_id VARCHAR(50) PRIMARY KEY,
    student_id VARCHAR(50) NOT NULL,
    date VARCHAR(20) NOT NULL,
    status VARCHAR(50) NOT NULL,
    time VARCHAR(10) NOT NULL,
    FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE
);

-- 8. Trips Table
CREATE TABLE IF NOT EXISTS trips (
    trip_id VARCHAR(50) PRIMARY KEY,
    route_id VARCHAR(50) NOT NULL,
    bus_id VARCHAR(50) NOT NULL,
    driver_id VARCHAR(50) NOT NULL,
    start_time VARCHAR(50) NOT NULL,
    end_time VARCHAR(50) NULL,
    status VARCHAR(50) NOT NULL, -- 'Active', 'Completed', 'Paused'
    current_stop_index INT NOT NULL DEFAULT 0,
    distance_covered VARCHAR(50) NOT NULL DEFAULT '0 km',
    logs TEXT, -- Serialized logs as text or JSON
    FOREIGN KEY (route_id) REFERENCES routes(route_id) ON DELETE CASCADE,
    FOREIGN KEY (bus_id) REFERENCES buses(bus_id) ON DELETE CASCADE,
    FOREIGN KEY (driver_id) REFERENCES drivers(driver_id) ON DELETE CASCADE
);

-- 9. Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
    notification_id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    timestamp VARCHAR(50) NOT NULL,
    type VARCHAR(50) NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- 10. Route Optimizations
CREATE TABLE IF NOT EXISTS route_optimizations (
    optimization_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    route_id BIGINT NOT NULL,
    school_address VARCHAR(200) NOT NULL,
    student_pickup_locations TEXT NOT NULL,
    bus_capacity INT NOT NULL,
    number_of_students INT NOT NULL,
    bus_assigned VARCHAR(50) NOT NULL,
    traffic_level VARCHAR(50) NOT NULL,
    road_closures TEXT,
    suggested_route TEXT NOT NULL,
    stops_order TEXT NOT NULL,
    total_distance DOUBLE NOT NULL,
    estimated_time DOUBLE NOT NULL,
    fuel_efficiency DOUBLE NOT NULL,
    bus_utilization DOUBLE NOT NULL,
    algorithm_used VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 11. GPS Location History
CREATE TABLE IF NOT EXISTS gps_locations (
    location_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    trip_id BIGINT NOT NULL,
    latitude DOUBLE NOT NULL,
    longitude DOUBLE NOT NULL,
    speed DOUBLE NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 12. Delay Predictions
CREATE TABLE IF NOT EXISTS delay_predictions (
    prediction_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    trip_id BIGINT NOT NULL,
    status VARCHAR(50) NOT NULL, -- 'On Time', 'Minor Delay', 'Major Delay'
    estimated_minutes_delay INT NOT NULL,
    weather_condition VARCHAR(50) NOT NULL,
    traffic_condition VARCHAR(50) NOT NULL,
    predicted_eta VARCHAR(50) NOT NULL,
    calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 13. Emergency SOS Records
CREATE TABLE IF NOT EXISTS emergencies (
    emergency_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    trip_id BIGINT NOT NULL,
    driver_id BIGINT NOT NULL,
    bus_id BIGINT NOT NULL,
    latitude DOUBLE NOT NULL,
    longitude DOUBLE NOT NULL,
    reason VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL, -- 'Open', 'Resolved', 'Cancelled'
    students_onboard INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP NULL,
    resolution_notes TEXT
);

-- 14. Student QR Tokens
CREATE TABLE IF NOT EXISTS student_qrs (
    qr_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    student_id BIGINT NOT NULL UNIQUE,
    qr_code_token VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 15. Student Face Embeddings
CREATE TABLE IF NOT EXISTS face_embeddings (
    embedding_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    student_id BIGINT NOT NULL UNIQUE,
    embedding_data TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 16. Detailed Scan Attendance Events
CREATE TABLE IF NOT EXISTS attendance_events (
    event_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    student_id BIGINT NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'QR', 'FACE', 'MANUAL'
    confidence DOUBLE NULL,
    scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) NOT NULL -- 'Boarded', 'Dropped'
);

-- 17. Parent Grievances
CREATE TABLE IF NOT EXISTS grievances (
    grievance_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    parent_id BIGINT NOT NULL,
    title VARCHAR(150) NOT NULL,
    category VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'Pending',
    resolution_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

-- 18. Driver Ratings
CREATE TABLE IF NOT EXISTS driver_ratings (
    rating_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    parent_id BIGINT NOT NULL,
    driver_id BIGINT NOT NULL,
    trip_id BIGINT NOT NULL,
    stars INT NOT NULL CHECK (stars >= 1 AND stars <= 5),
    comments TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

-- 19. Leave Requests
CREATE TABLE IF NOT EXISTS leave_requests (
    leave_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    student_id BIGINT NOT NULL,
    date VARCHAR(15) NOT NULL,
    reason VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'Approved',
    trip_type VARCHAR(20) DEFAULT 'Both',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);


