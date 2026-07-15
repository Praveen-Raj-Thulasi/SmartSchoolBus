package com.schoolbus.service;

import com.schoolbus.model.Grievance;
import com.schoolbus.model.User;
import com.schoolbus.repository.GrievanceRepository;
import com.schoolbus.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.util.List;
import java.util.Optional;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.access.AccessDeniedException;

@Service
public class GrievanceService {

    @Autowired
    private GrievanceRepository grievanceRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private NotificationService notificationService;

    public List<Grievance> getAllGrievances() {
        return grievanceRepository.findAll();
    }

    public List<Grievance> getGrievancesByParent(Long parentId) {
        return grievanceRepository.findByParentId(parentId);
    }

    public Optional<Grievance> getGrievanceById(Long grievanceId) {
        return grievanceRepository.findById(grievanceId);
    }

    public Grievance submitGrievance(Long parentId, String title, String category, String description) {
        Grievance grievance = new Grievance();
        grievance.setParentId(parentId);
        grievance.setTitle(title);
        grievance.setCategory(category);
        grievance.setDescription(description);
        grievance.setStatus("Pending");

        Grievance saved = grievanceRepository.save(grievance);

        // Notify admins about the new grievance
        userRepository.findAll().stream()
                .filter(u -> "admin".equalsIgnoreCase(u.getRole()))
                .forEach(admin -> {
                    notificationService.createNotification(
                            admin.getUserId(),
                            String.format("New parent grievance received: \"%s\" under category \"%s\".", title, category),
                            "Grievance Lodged"
                    );
                });

        return saved;
    }

    public Grievance resolveGrievance(Long grievanceId, String resolutionNotes) {
        Optional<Grievance> grievanceOpt = grievanceRepository.findById(grievanceId);
        if (grievanceOpt.isEmpty()) {
            throw new IllegalArgumentException("Grievance not found: " + grievanceId);
        }

        Grievance grievance = grievanceOpt.get();
        validateGrievanceOwnershipOrAdmin(grievance);
        grievance.setStatus("Resolved");
        grievance.setResolutionNotes(resolutionNotes);

        Grievance saved = grievanceRepository.save(grievance);

        // Notify the parent who lodged the grievance
        userRepository.findAll().stream()
                .filter(u -> grievance.getParentId().equals(u.getParentId()))
                .findFirst()
                .ifPresent(parentUser -> {
                    notificationService.createNotification(
                            parentUser.getUserId(),
                            String.format("Your grievance \"%s\" has been resolved: \"%s\".", grievance.getTitle(), resolutionNotes),
                            "Grievance Resolved"
                    );
                });

        return saved;
    }

    public Grievance updateGrievanceStatus(Long grievanceId, String status, String resolutionNotes) {
        Optional<Grievance> grievanceOpt = grievanceRepository.findById(grievanceId);
        if (grievanceOpt.isEmpty()) {
            throw new IllegalArgumentException("Grievance not found: " + grievanceId);
        }

        Grievance grievance = grievanceOpt.get();
        validateGrievanceOwnershipOrAdmin(grievance);
        grievance.setStatus(status);
        if (resolutionNotes != null) {
            grievance.setResolutionNotes(resolutionNotes);
        }

        Grievance saved = grievanceRepository.save(grievance);

        // Notify parent
        userRepository.findAll().stream()
                .filter(u -> grievance.getParentId().equals(u.getParentId()))
                .findFirst()
                .ifPresent(parentUser -> {
                    notificationService.createNotification(
                            parentUser.getUserId(),
                            String.format("Your grievance \"%s\" status updated to %s.", grievance.getTitle(), status),
                            "Grievance Updated"
                    );
                });

        return saved;
    }

    private void validateGrievanceOwnershipOrAdmin(Grievance grievance) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null) {
            throw new AccessDeniedException("Unauthorized access");
        }
        String currentUsername = auth.getName();
        User currentUser = userRepository.findByUsername(currentUsername)
                .orElseThrow(() -> new AccessDeniedException("User not found: " + currentUsername));

        if (!"admin".equalsIgnoreCase(currentUser.getRole())) {
            if (!"parent".equalsIgnoreCase(currentUser.getRole()) || 
                currentUser.getParentId() == null || 
                !currentUser.getParentId().equals(grievance.getParentId())) {
                throw new AccessDeniedException("You do not have permission to modify this grievance.");
            }
        }
    }
}
