package com.schoolbus;

import com.schoolbus.model.*;
import com.schoolbus.repository.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

import java.util.Arrays;

@Component
public class DatabaseSeeder implements CommandLineRunner {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private org.springframework.security.crypto.password.PasswordEncoder passwordEncoder;

    @Autowired
    private StudentRepository studentRepository;

    @Autowired
    private ParentRepository parentRepository;

    @Autowired
    private DriverRepository driverRepository;

    @Autowired
    private BusRepository busRepository;

    @Autowired
    private RouteRepository routeRepository;

    @Autowired
    private NotificationRepository notificationRepository;

    @Autowired
    private AttendanceRepository attendanceRepository;

    @Autowired
    private GrievanceRepository grievanceRepository;

    @Autowired
    private DriverRatingRepository driverRatingRepository;

    @Override
    public void run(String... args) throws Exception {
        try {
            if (userRepository.count() > 0) {
                // Fix old unhashed passwords that were seeded incorrectly
                java.util.List<User> allUsers = userRepository.findAll();
                boolean updated = false;
                for (User u : allUsers) {
                    if (u.getPassword() != null && !u.getPassword().startsWith("$2a$")) {
                        u.setPassword(passwordEncoder.encode(u.getPassword()));
                        updated = true;
                    }
                }
                if (updated) {
                    userRepository.saveAll(allUsers);
                    System.out.println("Patched unhashed passwords in DB!");
                }
                
                // Seed extra attendance if not already present
                if (attendanceRepository.count() <= 4) {
                    seedExtraAttendance();
                }
                if (grievanceRepository.count() == 0) {
                    seedGrievancesAndRatings();
                }

                // Force update all routes and student addresses to Coimbatore if they haven't been updated yet
                java.util.List<Route> routes = routeRepository.findAll();
                if (!routes.isEmpty() && routes.stream().anyMatch(r -> r.getRouteName().contains("Route") && !r.getRouteName().contains("Coimbatore"))) {
                    System.out.println("Updating existing database routes and student addresses to Coimbatore...");
                    for (Route r : routes) {
                        if ("North Route".equals(r.getRouteName())) {
                            r.setRouteName("East Coimbatore Route");
                            r.setStops(Arrays.asList("School", "Gandhipuram", "Peelamedu", "Singanallur", "Ramanathapuram"));
                            routeRepository.save(r);
                        } else if ("South Route".equals(r.getRouteName())) {
                            r.setRouteName("West Coimbatore Route");
                            r.setStops(Arrays.asList("School", "Saibaba Colony", "RS Puram", "Town Hall", "Saravanampatti"));
                            routeRepository.save(r);
                        }
                    }

                    java.util.List<Student> students = studentRepository.findAll();
                    for (Student s : students) {
                        if ("Cedar Lane".equalsIgnoreCase(s.getAddress())) {
                            s.setAddress("Ramanathapuram");
                            studentRepository.save(s);
                        } else if ("Pine Road".equalsIgnoreCase(s.getAddress())) {
                            s.setAddress("Peelamedu");
                            studentRepository.save(s);
                        } else if ("Birch Court".equalsIgnoreCase(s.getAddress())) {
                            s.setAddress("Saibaba Colony");
                            studentRepository.save(s);
                        }
                    }
                }

                return; // Database already seeded
            }

            // 1. Seed Drivers
        Driver d1 = new Driver(null, "John Doe", "+1 555-0201", "DL-998877");
        Driver d2 = new Driver(null, "Jane Smith", "+1 555-0202", "DL-665544");
        driverRepository.saveAll(Arrays.asList(d1, d2));

        // 2. Seed Parents
        Parent p1 = new Parent(null, "Robert Johnson", "+1 555-0101", "robert@example.com");
        Parent p2 = new Parent(null, "Linda Smith", "+1 555-0102", "linda@example.com");
        Parent p3 = new Parent(null, "Mary Davis", "+1 555-0103", "mary@example.com");
        parentRepository.saveAll(Arrays.asList(p1, p2, p3));

        // 3. Seed Routes
        Route r1 = new Route(null, "East Coimbatore Route", "12 km", "30 mins", Arrays.asList("School", "Gandhipuram", "Peelamedu", "Singanallur", "Ramanathapuram"));
        Route r2 = new Route(null, "West Coimbatore Route", "15 km", "40 mins", Arrays.asList("School", "Saibaba Colony", "RS Puram", "Town Hall", "Saravanampatti"));
        routeRepository.saveAll(Arrays.asList(r1, r2));

        // 4. Seed Buses
        Bus b1 = new Bus(null, "BUS-101", 40, 1L, "Idle", "Good");
        Bus b2 = new Bus(null, "BUS-202", 30, 2L, "Idle", "Good");
        busRepository.saveAll(Arrays.asList(b1, b2));

        // 5. Seed Students
        Student s1 = new Student(null, "Alice Johnson", "8", "A", 1L, 1L, 1L, "Ramanathapuram", null, null, null, 1);
        Student s2 = new Student(null, "Bob Smith", "9", "B", 2L, 1L, 1L, "Peelamedu", null, null, null, 2);
        Student s3 = new Student(null, "Charlie Davis", "7", "C", 3L, 2L, 2L, "Saibaba Colony", null, null, null, 1);
        studentRepository.saveAll(Arrays.asList(s1, s2, s3));

        // 6. Seed Users
        String encodedPassword = passwordEncoder.encode("password");
        User adminUser = new User(1L, "schooladmin", encodedPassword, "admin", "School Administrator", null, null, null);
        User driverUser1 = new User(2L, "driver1", encodedPassword, "driver", "John Doe", 1L, null, null);
        User parentUser1 = new User(3L, "parent1", encodedPassword, "parent", "Robert Johnson", null, 1L, null);
        User studentUser1 = new User(4L, "student1", encodedPassword, "student", "Alice Johnson", null, null, 1L);
        
        User driverUser2 = new User(5L, "driver2", encodedPassword, "driver", "Jane Smith", 2L, null, null);
        User parentUser2 = new User(6L, "parent2", encodedPassword, "parent", "Linda Smith", null, 2L, null);
        User parentUser3 = new User(7L, "parent3", encodedPassword, "parent", "Mary Davis", null, 3L, null);
        User studentUser2 = new User(8L, "student2", encodedPassword, "student", "Bob Smith", null, null, 2L);
        User studentUser3 = new User(9L, "student3", encodedPassword, "student", "Charlie Davis", null, null, 3L);

        userRepository.saveAll(Arrays.asList(
            adminUser, driverUser1, parentUser1, studentUser1,
            driverUser2, parentUser2, parentUser3, studentUser2, studentUser3
        ));

        // 7. Seed Notifications
        Notification n1 = new Notification(null, 3L, "Bus BUS-101 has successfully ended its trip.", "2026-06-13T16:30:00Z", "Bus Ended");
        Notification n2 = new Notification(null, 4L, "Welcome to the Smart School Bus Management System!", "2026-06-13T12:00:00Z", "Welcome");
        notificationRepository.saveAll(Arrays.asList(n1, n2));

        // 8. Seed Attendance
        seedExtraAttendance();

        // 9. Seed Grievances & Ratings
        seedGrievancesAndRatings();
        } catch (org.springframework.dao.DataIntegrityViolationException e) {
            System.out.println("Database already contains seed data (possibly soft-deleted). Skipping seeder.");
        }
    }

    private void seedExtraAttendance() {
        attendanceRepository.deleteAll(); // Clear first to ensure no duplicates
        attendanceRepository.saveAll(Arrays.asList(
            // Alice Johnson (1L)
            new Attendance(null, 1L, "2026-06-12", "Boarded", "08:02"),
            new Attendance(null, 1L, "2026-06-12", "Dropped", "16:20"),
            new Attendance(null, 1L, "2026-06-15", "Boarded", "08:05"),
            new Attendance(null, 1L, "2026-06-15", "Dropped", "16:15"),
            new Attendance(null, 1L, "2026-06-16", "Absent", "08:00"),
            new Attendance(null, 1L, "2026-06-17", "Boarded", "08:08"),
            new Attendance(null, 1L, "2026-06-17", "Dropped", "16:25"),
            new Attendance(null, 1L, "2026-06-18", "Boarded", "08:10"),
            
            // Bob Smith (2L)
            new Attendance(null, 2L, "2026-06-12", "Boarded", "08:03"),
            new Attendance(null, 2L, "2026-06-12", "Dropped", "16:18"),
            new Attendance(null, 2L, "2026-06-15", "Boarded", "08:06"),
            new Attendance(null, 2L, "2026-06-15", "Dropped", "16:12"),
            new Attendance(null, 2L, "2026-06-16", "Boarded", "08:04"),
            new Attendance(null, 2L, "2026-06-16", "Dropped", "16:14"),
            new Attendance(null, 2L, "2026-06-17", "Absent", "08:00"),
            new Attendance(null, 2L, "2026-06-18", "Boarded", "08:12"),
            
            // Charlie Davis (3L)
            new Attendance(null, 3L, "2026-06-15", "Boarded", "08:07"),
            new Attendance(null, 3L, "2026-06-15", "Dropped", "16:19"),
            new Attendance(null, 3L, "2026-06-16", "Boarded", "08:05"),
            new Attendance(null, 3L, "2026-06-16", "Dropped", "16:10"),
            new Attendance(null, 3L, "2026-06-17", "Boarded", "08:09"),
            new Attendance(null, 3L, "2026-06-17", "Dropped", "16:11"),
            new Attendance(null, 3L, "2026-06-18", "Boarded", "08:08")
        ));
        System.out.println("Seeded extra attendance records!");
    }

    private void seedGrievancesAndRatings() {
        grievanceRepository.deleteAll();
        driverRatingRepository.deleteAll();

        // Seed parent grievances
        Grievance gr1 = new Grievance(null, 1L, "Late Arrival Again", "Delay", "The bus arrived 15 minutes late at the Cedar Lane stop today.", "Pending", null);
        Grievance gr2 = new Grievance(null, 2L, "Driver Skipped Stop", "Driver Behavior", "Driver skipped Pine Road stop initially and had to turn back.", "Resolved", "Driver counselled about route schedules.");
        grievanceRepository.saveAll(Arrays.asList(gr1, gr2));

        // Seed driver ratings (Robert Johnson parentId=1, Linda Smith parentId=2, John Doe driverId=1)
        DriverRating rate1 = new DriverRating(null, 1L, 1L, 101L, 5, "Excellent driving, very polite!");
        DriverRating rate2 = new DriverRating(null, 2L, 1L, 102L, 4, "On time, very safe driving.");
        driverRatingRepository.saveAll(Arrays.asList(rate1, rate2));
        
        System.out.println("Seeded grievances and ratings records!");
    }
}
