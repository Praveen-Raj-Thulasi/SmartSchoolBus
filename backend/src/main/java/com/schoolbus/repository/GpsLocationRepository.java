package com.schoolbus.repository;

import com.schoolbus.model.GpsLocation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface GpsLocationRepository extends JpaRepository<GpsLocation, Long> {
    List<GpsLocation> findByTripIdOrderByTimestampAsc(Long tripId);
    Optional<GpsLocation> findFirstByTripIdOrderByTimestampDesc(Long tripId);
    Optional<GpsLocation> findFirstByTripIdOrderByLocationIdDesc(Long tripId);
}
