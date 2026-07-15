package com.schoolbus.repository;

import com.schoolbus.model.FaceEmbedding;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.Optional;

@Repository
public interface FaceEmbeddingRepository extends JpaRepository<FaceEmbedding, Long> {
    Optional<FaceEmbedding> findByStudentId(Long studentId);
}
