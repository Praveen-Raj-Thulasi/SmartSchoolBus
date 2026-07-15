package com.schoolbus.repository;

import com.schoolbus.model.RouteOptimization;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface RouteOptimizationRepository extends JpaRepository<RouteOptimization, Long> {
    List<RouteOptimization> findByRouteId(Long routeId);
}
