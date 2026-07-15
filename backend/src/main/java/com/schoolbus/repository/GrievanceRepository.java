package com.schoolbus.repository;

import com.schoolbus.model.Grievance;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface GrievanceRepository extends JpaRepository<Grievance, Long> {
    List<Grievance> findByParentId(Long parentId);
    List<Grievance> findByStatus(String status);
}
