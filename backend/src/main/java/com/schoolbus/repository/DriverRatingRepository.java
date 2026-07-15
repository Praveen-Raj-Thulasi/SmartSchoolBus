package com.schoolbus.repository;

import com.schoolbus.model.DriverRating;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface DriverRatingRepository extends JpaRepository<DriverRating, Long> {
    List<DriverRating> findByDriverId(Long driverId);
    List<DriverRating> findByParentId(Long parentId);
    Optional<DriverRating> findByTripIdAndParentId(Long tripId, Long parentId);
}
