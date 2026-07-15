package com.schoolbus.service;

import com.schoolbus.model.DriverRating;
import com.schoolbus.model.Trip;
import com.schoolbus.repository.DriverRatingRepository;
import com.schoolbus.repository.TripRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.util.List;
import java.util.Optional;

@Service
public class DriverRatingService {

    @Autowired
    private DriverRatingRepository driverRatingRepository;

    @Autowired
    private TripRepository tripRepository;

    @Autowired
    private com.schoolbus.repository.StudentRepository studentRepository;

    public List<DriverRating> getAllRatings() {
        return driverRatingRepository.findAll();
    }

    public List<DriverRating> getRatingsForDriver(Long driverId) {
        return driverRatingRepository.findByDriverId(driverId);
    }

    public Optional<DriverRating> getRatingByTripAndParent(Long tripId, Long parentId) {
        return driverRatingRepository.findByTripIdAndParentId(tripId, parentId);
    }

    public Double getAverageRatingForDriver(Long driverId) {
        List<DriverRating> ratings = driverRatingRepository.findByDriverId(driverId);
        if (ratings.isEmpty()) {
            return 0.0;
        }
        double sum = 0.0;
        for (DriverRating r : ratings) {
            sum += r.getStars();
        }
        return sum / ratings.size();
    }

    public DriverRating submitRating(Long parentId, Long driverId, Long tripId, Integer stars, String comments) {
        // Ensure ratings parameters are correct
        if (stars < 1 || stars > 5) {
            throw new IllegalArgumentException("Stars must be between 1 and 5");
        }

        // 1. Verify trip exists
        Trip trip = tripRepository.findById(tripId)
                .orElseThrow(() -> new IllegalArgumentException("Trip not found with ID: " + tripId));

        // 2. Verify driver matches the trip
        if (!trip.getDriverId().equals(driverId)) {
            throw new IllegalArgumentException("The driver ID does not match the driver assigned to this trip.");
        }

        // 3. Verify parent has a student assigned to the trip's route
        List<com.schoolbus.model.Student> students = studentRepository.findByParentId(parentId);
        boolean hasStudentOnRoute = students.stream()
                .anyMatch(s -> s.getRouteId() != null && s.getRouteId().equals(trip.getRouteId()));
        if (!hasStudentOnRoute) {
            throw new IllegalArgumentException("Parent has no students assigned to the route for this trip.");
        }

        // 4. Block duplicate ratings (one rating per parent-trip)
        Optional<DriverRating> existing = driverRatingRepository.findByTripIdAndParentId(tripId, parentId);
        if (existing.isPresent()) {
            throw new IllegalArgumentException("Parent has already submitted a rating for this trip.");
        }

        DriverRating rating = new DriverRating();
        rating.setParentId(parentId);
        rating.setDriverId(driverId);
        rating.setTripId(tripId);
        rating.setStars(stars);
        rating.setComments(comments);

        DriverRating saved = driverRatingRepository.save(rating);

        // Optional log entry in the completed trip to indicate it has feedback
        if (trip.getLogs() != null) {
            trip.getLogs().add(String.format("Parent feedback received: ⭐ %d. Comments: %s", stars, comments));
            tripRepository.save(trip);
        }

        return saved;
    }
}
