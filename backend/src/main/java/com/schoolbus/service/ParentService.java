package com.schoolbus.service;

import com.schoolbus.model.Parent;
import com.schoolbus.model.User;
import com.schoolbus.repository.ParentRepository;
import com.schoolbus.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import java.util.List;
import java.util.Optional;

@Service
public class ParentService {

    @Autowired
    private ParentRepository parentRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    public List<Parent> getAllParents() {
        return parentRepository.findAll();
    }

    public Optional<Parent> getParentById(Long parentId) {
        return parentRepository.findById(parentId);
    }

    public Parent addParent(Parent parent) {
        if (parent.getParentId() == null || parent.getParentId() == null) {
        }
        Parent saved = parentRepository.save(parent);

        // Auto-create User login credentials matching React logic
        User user = new User();
        user.setUsername("parent_" + saved.getParentId());
        user.setPassword(passwordEncoder.encode("password"));
        user.setRole("parent");
        user.setName(saved.getName());
        user.setParentId(saved.getParentId());
        userRepository.save(user);

        return saved;
    }

    public Parent updateParent(Long parentId, Parent parentData) {
        Optional<Parent> parentOpt = parentRepository.findById(parentId);
        if (parentOpt.isPresent()) {
            Parent parent = parentOpt.get();
            parent.setName(parentData.getName());
            parent.setPhone(parentData.getPhone());
            parent.setEmail(parentData.getEmail());
            Parent updated = parentRepository.save(parent);

            // Sync User login name
            Optional<User> userOpt = userRepository.findByParentId(parentId);
            if (userOpt.isPresent()) {
                User user = userOpt.get();
                user.setName(updated.getName());
                userRepository.save(user);
            }
            return updated;
        }
        throw new RuntimeException("Parent not found");
    }

    public void deleteParent(Long parentId) {
        parentRepository.deleteById(parentId);
        userRepository.findByParentId(parentId).ifPresent(u -> userRepository.delete(u));
    }
}
