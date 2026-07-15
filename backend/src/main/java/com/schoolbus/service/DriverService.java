package com.schoolbus.service;

import com.schoolbus.model.Driver;
import com.schoolbus.model.User;
import com.schoolbus.repository.DriverRepository;
import com.schoolbus.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import java.util.List;
import java.util.Optional;

@Service
public class DriverService {

    @Autowired
    private DriverRepository driverRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    public List<Driver> getAllDrivers() {
        return driverRepository.findAll();
    }

    public Optional<Driver> getDriverById(Long driverId) {
        return driverRepository.findById(driverId);
    }

    public Driver addDriver(Driver driver) {
        if (driver.getDriverId() == null || driver.getDriverId() == null) {
        }
        Driver saved = driverRepository.save(driver);

        // Auto-create User login credentials matching React logic
        User user = new User();
        user.setUsername("driver_" + saved.getDriverId());
        user.setPassword(passwordEncoder.encode("password"));
        user.setRole("driver");
        user.setName(saved.getName());
        user.setDriverId(saved.getDriverId());
        userRepository.save(user);

        return saved;
    }

    public Driver updateDriver(Long driverId, Driver driverData) {
        Optional<Driver> driverOpt = driverRepository.findById(driverId);
        if (driverOpt.isPresent()) {
            Driver driver = driverOpt.get();
            driver.setName(driverData.getName());
            driver.setPhone(driverData.getPhone());
            driver.setLicenseNumber(driverData.getLicenseNumber());
            Driver updated = driverRepository.save(driver);

            // Sync User login name
            Optional<User> userOpt = userRepository.findByDriverId(driverId);
            if (userOpt.isPresent()) {
                User user = userOpt.get();
                user.setName(updated.getName());
                userRepository.save(user);
            }
            return updated;
        }
        throw new RuntimeException("Driver not found");
    }

    public void deleteDriver(Long driverId) {
        driverRepository.deleteById(driverId);
        userRepository.findByDriverId(driverId).ifPresent(u -> userRepository.delete(u));
    }
}
