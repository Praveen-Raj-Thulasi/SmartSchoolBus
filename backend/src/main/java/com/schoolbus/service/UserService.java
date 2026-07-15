package com.schoolbus.service;

import com.schoolbus.model.User;
import com.schoolbus.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.util.List;
import java.util.Optional;

@Service
public class UserService {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private org.springframework.security.crypto.password.PasswordEncoder passwordEncoder;

    @Autowired
    private com.schoolbus.repository.PasswordHistoryRepository passwordHistoryRepository;

    public Optional<User> authenticate(String username, String password) {
        return userRepository.findByUsername(username)
                .filter(user -> passwordEncoder.matches(password, user.getPassword()));
    }

    public boolean resetPassword(String username, String newPassword) {
        Optional<User> userOpt = userRepository.findByUsername(username);
        if (userOpt.isPresent()) {
            User user = userOpt.get();

            // 1. Check if it matches current password
            if (passwordEncoder.matches(newPassword, user.getPassword())) {
                throw new IllegalArgumentException("New password cannot be any of the last 3 passwords used.");
            }

            // 2. Check if it matches any of the last 2 entries from PasswordHistory (representing 2nd and 3rd past changes)
            List<com.schoolbus.model.PasswordHistory> historyList = passwordHistoryRepository.findByUserIdOrderByCreatedAtDesc(user.getUserId());
            int checkLimit = Math.min(2, historyList.size());
            for (int i = 0; i < checkLimit; i++) {
                if (passwordEncoder.matches(newPassword, historyList.get(i).getPasswordHash())) {
                    throw new IllegalArgumentException("New password cannot be any of the last 3 passwords used.");
                }
            }

            // 3. Save active password hash to history before updating
            com.schoolbus.model.PasswordHistory history = new com.schoolbus.model.PasswordHistory();
            history.setUserId(user.getUserId());
            history.setPasswordHash(user.getPassword());
            passwordHistoryRepository.save(history);

            user.setPassword(passwordEncoder.encode(newPassword));
            userRepository.save(user);
            return true;
        }
        return false;
    }

    public List<User> getAllUsers() {
        return userRepository.findAll();
    }

    public User saveUser(User user) {
        return userRepository.save(user);
    }

    public void deleteUser(Long userId) {
        userRepository.deleteById(userId);
    }

    public Optional<User> getUserByUsername(String username) {
        return userRepository.findByUsername(username);
    }
}
