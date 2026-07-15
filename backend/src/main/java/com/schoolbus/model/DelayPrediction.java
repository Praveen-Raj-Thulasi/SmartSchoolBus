package com.schoolbus.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

@Entity
@Table(name = "delay_predictions")
@Data
@lombok.EqualsAndHashCode(callSuper = true)
@NoArgsConstructor
@AllArgsConstructor
@SQLDelete(sql = "UPDATE delay_predictions SET is_active = false WHERE prediction_id=?")
@SQLRestriction("is_active = true")
public class DelayPrediction extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "prediction_id")
    private Long predictionId;

    @Column(name = "trip_id", nullable = false)
    private Long tripId;

    @Column(nullable = false)
    private String status; // 'On Time', 'Minor Delay', 'Major Delay'

    @Column(name = "estimated_minutes_delay", nullable = false)
    private Integer estimatedMinutesDelay;

    @Column(name = "weather_condition", nullable = false)
    private String weatherCondition;

    @Column(name = "traffic_condition", nullable = false)
    private String trafficCondition;

    @Column(name = "predicted_eta", nullable = false)
    private String predictedEta;
}
