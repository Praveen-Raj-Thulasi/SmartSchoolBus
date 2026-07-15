package com.schoolbus.repository;

import com.schoolbus.model.StudentQr;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.Optional;

@Repository
public interface StudentQrRepository extends JpaRepository<StudentQr, Long> {
    Optional<StudentQr> findByStudentId(Long studentId);
    Optional<StudentQr> findByQrCodeToken(String qrCodeToken);
}
