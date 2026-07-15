package com.schoolbus.repository;

import com.schoolbus.model.StudentRequest;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface StudentRequestRepository extends JpaRepository<StudentRequest, Long> {
    List<StudentRequest> findByParentId(Long parentId);
}
