package com.schoolbus.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

@Service
public class EmailService {

    @Autowired
    private JavaMailSender mailSender;

    public void sendOtpEmail(String toEmail, String otp) {
        System.out.println("\n=================================================");
        System.out.println("DEVELOPMENT MODE OTP INTERCEPT:");
        System.out.println("To: " + toEmail);
        System.out.println("OTP: " + otp);
        System.out.println("=================================================\n");
        
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setTo(toEmail);
            message.setSubject("Smart School Bus - Registration OTP");
            message.setText("Your OTP for registration is: " + otp + "\n\nThis OTP is valid for 5 minutes.");
            mailSender.send(message);
            System.out.println("Email successfully sent to " + toEmail);
        } catch (Exception e) {
            System.err.println("WARNING: Failed to send real email because SMTP is not configured properly.");
            System.err.println("You can proceed using the OTP printed above in the terminal.");
        }
    }
}
