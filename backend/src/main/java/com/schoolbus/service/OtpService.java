package com.schoolbus.service;

import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class OtpService {

    private final long OTP_VALID_DURATION = 2 * 60 * 1000; // 2 minutes
    private Map<String, OtpDetails> otpCache = new ConcurrentHashMap<>();

    public String generateOtp(String email) {
        SecureRandom random = new SecureRandom();
        int otp = 100000 + random.nextInt(900000); // 6-digit OTP
        String otpString = String.valueOf(otp);

        otpCache.put(email, new OtpDetails(otpString, System.currentTimeMillis()));
        return otpString;
    }

    public boolean validateOtp(String email, String otp) {
        if (otpCache.containsKey(email)) {
            OtpDetails details = otpCache.get(email);
            if (System.currentTimeMillis() - details.timestamp > OTP_VALID_DURATION) {
                otpCache.remove(email); // Expired
                return false;
            }
            if (details.otp.equals(otp)) {
                otpCache.remove(email); // Success, remove it so it can't be reused
                return true;
            }
        }
        return false;
    }

    private static class OtpDetails {
        String otp;
        long timestamp;

        OtpDetails(String otp, long timestamp) {
            this.otp = otp;
            this.timestamp = timestamp;
        }
    }
}
