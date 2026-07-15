package com.schoolbus.controller;

import com.schoolbus.model.User;
import com.schoolbus.model.Parent;
import com.schoolbus.model.Driver;
import com.schoolbus.model.Student;
import com.schoolbus.service.UserService;
import com.schoolbus.service.ParentService;
import com.schoolbus.service.DriverService;
import com.schoolbus.service.StudentService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    @Autowired
    private UserService userService;

    @Autowired
    private ParentService parentService;

    @Autowired
    private DriverService driverService;

    @Autowired
    private StudentService studentService;

    @Autowired
    private org.springframework.security.authentication.AuthenticationManager authenticationManager;

    @Autowired
    private com.schoolbus.security.JwtUtil jwtUtil;

    @Autowired
    private com.schoolbus.service.LoginAttemptService loginAttemptService;

    @Autowired
    private org.springframework.security.crypto.password.PasswordEncoder passwordEncoder;

    @Autowired
    private com.schoolbus.service.OtpService otpService;

    @Autowired
    private com.schoolbus.service.EmailService emailService;

    @PostMapping("/send-otp")
    public ResponseEntity<?> sendOtp(@RequestBody Map<String, String> payload) {
        String email = payload.get("email");
        String phone = payload.get("phone");
        String purpose = payload.get("purpose");

        if ((email == null || email.trim().isEmpty()) && (phone == null || phone.trim().isEmpty())) {
            Map<String, String> err = new HashMap<>();
            err.put("message", "Email or phone number is required");
            return ResponseEntity.badRequest().body(err);
        }

        String target = (email != null && !email.trim().isEmpty()) ? email.trim() : phone.trim();

        if ("reset".equals(purpose)) {
            // Verify if target is registered to an active User
            boolean userExists = false;

            Optional<Long> parentIdOpt = parentService.getAllParents().stream()
                    .filter(p -> (p.getEmail() != null && !p.getEmail().trim().isEmpty() && target.equalsIgnoreCase(p.getEmail().trim()))
                            || (p.getPhone() != null && !p.getPhone().trim().isEmpty() && target.equals(p.getPhone().trim())))
                    .map(Parent::getParentId)
                    .findFirst();

            Optional<Long> driverIdOpt = driverService.getAllDrivers().stream()
                    .filter(d -> d.getPhone() != null && !d.getPhone().trim().isEmpty() && target.equals(d.getPhone().trim()))
                    .map(Driver::getDriverId)
                    .findFirst();

            Optional<Long> studentIdOpt = studentService.getAllStudents().stream()
                    .filter(s -> (s.getEmail() != null && !s.getEmail().trim().isEmpty() && target.equalsIgnoreCase(s.getEmail().trim()))
                            || (s.getPhone() != null && !s.getPhone().trim().isEmpty() && target.equals(s.getPhone().trim())))
                    .map(Student::getStudentId)
                    .findFirst();

            if (parentIdOpt.isPresent()) {
                userExists = userService.getAllUsers().stream()
                        .anyMatch(u -> parentIdOpt.get().equals(u.getParentId()));
            } else if (driverIdOpt.isPresent()) {
                userExists = userService.getAllUsers().stream()
                        .anyMatch(u -> driverIdOpt.get().equals(u.getDriverId()));
            } else if (studentIdOpt.isPresent()) {
                userExists = userService.getAllUsers().stream()
                        .anyMatch(u -> studentIdOpt.get().equals(u.getStudentId()));
            }

            if (!userExists) {
                Map<String, String> err = new HashMap<>();
                err.put("message", "No registered account found with this email/phone number.");
                return ResponseEntity.badRequest().body(err);
            }
        }

        if (phone != null && !phone.trim().isEmpty()) {
            String otp = otpService.generateOtp(phone.trim());
            System.out.println("SIMULATED SMS OTP: Sent OTP " + otp + " to phone number " + phone.trim());
            Map<String, String> response = new HashMap<>();
            response.put("message", "SMS OTP sent successfully (simulated) to " + phone.trim() + " [Code: " + otp + "]");
            return ResponseEntity.ok(response);
        } else {
            String otp = otpService.generateOtp(email.trim());
            try {
                emailService.sendOtpEmail(email.trim(), otp);
                Map<String, String> response = new HashMap<>();
                response.put("message", "OTP sent successfully to " + email.trim());
                return ResponseEntity.ok(response);
            } catch (Exception e) {
                Map<String, String> err = new HashMap<>();
                err.put("message", "Failed to send email. Please check your SMTP configuration.");
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(err);
            }
        }
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody Map<String, String> credentials) {
        String username = credentials.get("username");
        String password = credentials.get("password");

        if (username == null || password == null) {
            Map<String, String> err = new HashMap<>();
            err.put("message", "Username and password are required");
            return ResponseEntity.badRequest().body(err);
        }

        if (loginAttemptService.isBlocked(username)) {
            Map<String, String> err = new HashMap<>();
            err.put("message", "Account locked due to too many failed attempts. Try again later.");
            return ResponseEntity.status(HttpStatus.LOCKED).body(err);
        }

        try {
            authenticationManager.authenticate(
                    new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(username, password)
            );
            loginAttemptService.loginSucceeded(username);
        } catch (org.springframework.security.core.AuthenticationException e) {
            loginAttemptService.loginFailed(username);
            Map<String, String> err = new HashMap<>();
            err.put("message", "Invalid username or password");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(err);
        }

        Optional<User> userOpt = userService.authenticate(username, password);
        if (userOpt.isPresent()) {
            User user = userOpt.get();
            String token = jwtUtil.generateToken(user.getUsername(), user.getRole());
            
            Map<String, Object> response = new HashMap<>();
            response.put("token", token);
            response.put("user", user);
            
            return ResponseEntity.ok(response);
        } else {
            Map<String, String> err = new HashMap<>();
            err.put("message", "User details could not be retrieved");
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(err);
        }
    }

    @PostMapping("/reset-password")
    public ResponseEntity<?> resetPassword(@RequestBody Map<String, String> payload) {
        String emailOrPhone = payload.get("emailOrPhone");
        String otp = payload.get("otp");
        String newPassword = payload.get("password"); // matches client state key 'password' or 'newPassword'

        if (emailOrPhone == null || otp == null || newPassword == null || emailOrPhone.trim().isEmpty() || otp.trim().isEmpty() || newPassword.trim().isEmpty()) {
            Map<String, String> err = new HashMap<>();
            err.put("message", "Email/phone, OTP, and new password are required");
            return ResponseEntity.badRequest().body(err);
        }

        String target = emailOrPhone.trim();

        // 1. Validate OTP
        if (!otpService.validateOtp(target, otp.trim())) {
            Map<String, String> err = new HashMap<>();
            err.put("message", "Invalid or expired OTP.");
            return ResponseEntity.badRequest().body(err);
        }

        if (!isValidPassword(newPassword.trim())) {
            Map<String, String> err = new HashMap<>();
            err.put("message", "Password must be at least 8 characters long and contain at least one digit, one uppercase letter, one lowercase letter, and one special character.");
            return ResponseEntity.badRequest().body(err);
        }

        // 2. Resolve User by email or phone across Parent, Driver, Student
        Optional<Long> parentIdOpt = parentService.getAllParents().stream()
                .filter(p -> (p.getEmail() != null && !p.getEmail().trim().isEmpty() && target.equalsIgnoreCase(p.getEmail().trim()))
                        || (p.getPhone() != null && !p.getPhone().trim().isEmpty() && target.equals(p.getPhone().trim())))
                .map(Parent::getParentId)
                .findFirst();

        Optional<Long> driverIdOpt = driverService.getAllDrivers().stream()
                .filter(d -> d.getPhone() != null && !d.getPhone().trim().isEmpty() && target.equals(d.getPhone().trim()))
                .map(Driver::getDriverId)
                .findFirst();

        Optional<Long> studentIdOpt = studentService.getAllStudents().stream()
                .filter(s -> (s.getEmail() != null && !s.getEmail().trim().isEmpty() && target.equalsIgnoreCase(s.getEmail().trim()))
                        || (s.getPhone() != null && !s.getPhone().trim().isEmpty() && target.equals(s.getPhone().trim())))
                .map(Student::getStudentId)
                .findFirst();

        Optional<User> targetUser = Optional.empty();
        if (parentIdOpt.isPresent()) {
            targetUser = userService.getAllUsers().stream()
                    .filter(u -> parentIdOpt.get().equals(u.getParentId()))
                    .findFirst();
        } else if (driverIdOpt.isPresent()) {
            targetUser = userService.getAllUsers().stream()
                    .filter(u -> driverIdOpt.get().equals(u.getDriverId()))
                    .findFirst();
        } else if (studentIdOpt.isPresent()) {
            targetUser = userService.getAllUsers().stream()
                    .filter(u -> studentIdOpt.get().equals(u.getStudentId()))
                    .findFirst();
        }

        if (!targetUser.isPresent()) {
            Map<String, String> err = new HashMap<>();
            err.put("message", "No user found with the registered email/phone: " + emailOrPhone);
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(err);
        }

        User user = targetUser.get();
        try {
            boolean success = userService.resetPassword(user.getUsername(), newPassword);
            Map<String, Object> response = new HashMap<>();
            response.put("success", success);
            if (success) {
                return ResponseEntity.ok(response);
            } else {
                response.put("message", "Failed to update password.");
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(response);
            }
        } catch (IllegalArgumentException e) {
            Map<String, String> err = new HashMap<>();
            err.put("message", e.getMessage());
            return ResponseEntity.badRequest().body(err);
        }
    }

    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody Map<String, Object> payload) {
        String username = payload.get("username") != null ? payload.get("username").toString() : null;
        String password = payload.get("password") != null ? payload.get("password").toString() : null;
        String role = payload.get("role") != null ? payload.get("role").toString() : null;
        String name = payload.get("name") != null ? payload.get("name").toString() : null;
        String email = payload.get("email") != null ? payload.get("email").toString() : null;
        String otp = payload.get("otp") != null ? payload.get("otp").toString() : null;
        String phone = payload.get("phone") != null ? payload.get("phone").toString() : null;

        boolean isDriver = "driver".equals(role);
        if (username == null || username.trim().isEmpty() ||
            password == null || password.trim().isEmpty() ||
            role == null || role.trim().isEmpty() ||
            name == null || name.trim().isEmpty() ||
            otp == null || otp.trim().isEmpty() ||
            (!isDriver && (email == null || email.trim().isEmpty())) ||
            (isDriver && (phone == null || phone.trim().isEmpty()))) {
            Map<String, String> err = new HashMap<>();
            err.put("message", isDriver 
                ? "All required fields (including phone number and otp) must be filled." 
                : "All required fields (including email and otp) must be filled.");
            return ResponseEntity.badRequest().body(err);
        }

        String otpTarget = (isDriver && phone != null && !phone.isEmpty()) ? phone : email;

        if (!otpService.validateOtp(otpTarget, otp)) {
            Map<String, String> err = new HashMap<>();
            err.put("message", "Invalid or expired OTP.");
            return ResponseEntity.badRequest().body(err);
        }

        if (!isValidPassword(password)) {
            Map<String, String> err = new HashMap<>();
            err.put("message", "Password must be at least 8 characters long and contain at least one digit, one uppercase letter, one lowercase letter, and one special character.");
            return ResponseEntity.badRequest().body(err);
        }

        if (userService.getAllUsers().stream().anyMatch(u -> u.getUsername().equalsIgnoreCase(username))) {
            Map<String, String> err = new HashMap<>();
            err.put("message", "Username already exists.");
            return ResponseEntity.badRequest().body(err);
        }

        if ("parent".equals(role)) {
            Parent parent = new Parent();
            parent.setName(name);
            parent.setPhone(payload.getOrDefault("phone", "").toString());
            parent.setEmail(payload.getOrDefault("email", "").toString());
            Parent saved = parentService.addParent(parent);
            
            Optional<User> userOpt = userService.getAllUsers().stream()
                .filter(u -> saved.getParentId().equals(u.getParentId()))
                .findFirst();
            if (userOpt.isPresent()) {
                User u = userOpt.get();
                u.setUsername(username);
                u.setPassword(passwordEncoder.encode(password));
                userService.saveUser(u);
            } else {
                User u = new User();
                u.setUsername(username);
                u.setPassword(passwordEncoder.encode(password));
                u.setRole("parent");
                u.setName(name);
                u.setParentId(saved.getParentId());
                userService.saveUser(u);
            }
                
        } else if ("driver".equals(role)) {
            Driver driver = new Driver();
            driver.setName(name);
            driver.setPhone(payload.getOrDefault("phone", "").toString());
            driver.setLicenseNumber(payload.getOrDefault("licenseNumber", "").toString());
            Driver saved = driverService.addDriver(driver);
            
            Optional<User> userOpt = userService.getAllUsers().stream()
                .filter(u -> saved.getDriverId().equals(u.getDriverId()))
                .findFirst();
            if (userOpt.isPresent()) {
                User u = userOpt.get();
                u.setUsername(username);
                u.setPassword(passwordEncoder.encode(password));
                userService.saveUser(u);
            } else {
                User u = new User();
                u.setUsername(username);
                u.setPassword(passwordEncoder.encode(password));
                u.setRole("driver");
                u.setName(name);
                u.setDriverId(saved.getDriverId());
                userService.saveUser(u);
            }
                
        } else if ("student".equals(role)) {
            Student student = new Student();
            student.setName(name);
            student.setStudentClass(payload.getOrDefault("class", "").toString());
            student.setSection(payload.getOrDefault("section", "").toString());
            student.setAddress(payload.getOrDefault("address", "").toString());
            student.setEmail(email);
            student.setPhone(payload.getOrDefault("phone", "").toString());
            student.setParentId(payload.get("parentId") != null ? Long.valueOf(payload.get("parentId").toString()) : 1L); // defaults to 1L
            student.setRouteId(payload.get("routeId") != null ? Long.valueOf(payload.get("routeId").toString()) : null);
            student.setBusId(payload.get("busId") != null ? Long.valueOf(payload.get("busId").toString()) : null);
            Student saved = studentService.addStudent(student);
            
            Optional<User> userOpt = userService.getAllUsers().stream()
                .filter(u -> saved.getStudentId().equals(u.getStudentId()))
                .findFirst();
            if (userOpt.isPresent()) {
                User u = userOpt.get();
                u.setUsername(username);
                u.setPassword(passwordEncoder.encode(password));
                userService.saveUser(u);
            } else {
                User u = new User();
                u.setUsername(username);
                u.setPassword(passwordEncoder.encode(password));
                u.setRole("student");
                u.setName(name);
                u.setStudentId(saved.getStudentId());
                userService.saveUser(u);
            }
        } else {
            User user = new User();
            user.setUsername(username);
            user.setPassword(passwordEncoder.encode(password));
            user.setRole(role);
            user.setName(name);
            userService.saveUser(user);
        }

        Map<String, Object> successResponse = new HashMap<>();
        successResponse.put("success", true);
        return ResponseEntity.ok(successResponse);
    }

    private boolean isValidPassword(String password) {
        if (password == null) {
            return false;
        }
        String regex = "^(?=.*[0-9])(?=.*[a-z])(?=.*[A-Z])(?=.*[^a-zA-Z0-9]).{8,}$";
        return password.matches(regex);
    }
}
