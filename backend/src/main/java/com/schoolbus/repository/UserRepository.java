package com.schoolbus.repository;

import com.schoolbus.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByUsername(String username);
    Optional<User> findByDriverId(Long driverId);
    Optional<User> findByParentId(Long parentId);
    Optional<User> findByStudentId(Long studentId);
}
