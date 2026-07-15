package com.schoolbus.repository;

import com.schoolbus.model.DelayPrediction;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.Optional;

@Repository
public interface DelayPredictionRepository extends JpaRepository<DelayPrediction, Long> {
    Optional<DelayPrediction> findFirstByTripIdOrderByPredictionIdDesc(Long tripId);
}
