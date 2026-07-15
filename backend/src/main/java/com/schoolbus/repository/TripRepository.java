package com.schoolbus.repository;

import com.schoolbus.model.Trip;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.Optional;
import java.util.List;

@Repository
public interface TripRepository extends JpaRepository<Trip, Long> {
    Optional<Trip> findByBusIdAndStatus(Long busId, String status);
    List<Trip> findByDriverIdAndStatusIn(Long driverId, List<String> statuses);
    List<Trip> findByBusIdAndStatusIn(Long busId, List<String> statuses);
}
