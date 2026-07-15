package com.schoolbus.repository;

import com.schoolbus.model.Student;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface StudentRepository extends JpaRepository<Student, Long> {
    List<Student> findByParentId(Long parentId);
    List<Student> findByRouteId(Long routeId);
    List<Student> findByBusId(Long busId);
}
