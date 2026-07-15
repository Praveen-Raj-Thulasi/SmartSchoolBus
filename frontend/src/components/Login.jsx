import { useState, useContext, useEffect } from 'react';
import { AppContext } from '../context/AppContext';
import { Bus, Key, User, ShieldAlert } from 'lucide-react';
import './Login.css';

export default function Login() {
  const { login, resetPassword, registerUser, sendOtp } = useContext(AppContext);
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  const [mode, setMode] = useState('login'); // 'login', 'reset', or 'register'
  const [resetUsername, setResetUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [resetEmailOrPhone, setResetEmailOrPhone] = useState('');
  const [resetOtp, setResetOtp] = useState('');
  const [resetOtpSent, setResetOtpSent] = useState(false);
  const [resetOtpLoading, setResetOtpLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);

  const [otpCountdown, setOtpCountdown] = useState(0);
  const [resetOtpCountdown, setResetOtpCountdown] = useState(0);

  useEffect(() => {
    let timer;
    if (otpCountdown > 0) {
      timer = setTimeout(() => setOtpCountdown(otpCountdown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [otpCountdown]);

  useEffect(() => {
    let timer;
    if (resetOtpCountdown > 0) {
      timer = setTimeout(() => setResetOtpCountdown(resetOtpCountdown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [resetOtpCountdown]);

  const handleSendResetOtp = async () => {
    if (!resetEmailOrPhone) {
      setError('Please enter your email or phone number first.');
      return;
    }
    setResetOtpLoading(true);
    setError('');
    setSuccess('');
    const isEmail = resetEmailOrPhone.includes('@');
    const result = isEmail ? await sendOtp(resetEmailOrPhone, null, 'reset') : await sendOtp(null, resetEmailOrPhone, 'reset');
    setResetOtpLoading(false);
    if (result.success) {
      setSuccess(result.message);
      setResetOtpSent(true);
      setResetOtpCountdown(60);
    } else {
      setError(result.message);
    }
  };

  const handleSendOtp = async () => {
    const isDriver = registerForm.role === 'driver';
    const target = isDriver ? registerForm.phone : registerForm.email;
    if (!target) {
      setError(isDriver ? 'Please enter your phone number first.' : 'Please enter your email first.');
      return;
    }
    setOtpLoading(true);
    setError('');
    const result = isDriver ? await sendOtp(null, target) : await sendOtp(target);
    setOtpLoading(false);
    if (result.success) {
      setSuccess(result.message);
      setOtpSent(true);
      setOtpCountdown(60);
    } else {
      setError(result.message);
    }
  };

  const [registerForm, setRegisterForm] = useState({
    username: '',
    password: '',
    otp: '',
    role: 'parent',
    name: '',
    email: '',
    phone: '',
    licenseNumber: '',
    class: '',
    section: '',
    address: ''
  });

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    
    if (!username || !password) {
      setError('Please fill in all fields.');
      return;
    }
    
    const result = await login(username, password);
    if (!result.success) {
      setError(result.message);
    }
  };

  const handleResetSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!resetEmailOrPhone || !resetOtp || !newPassword || !confirmPassword) {
      setError('Please fill in all fields (including OTP).');
      return;
    }

    if (newPassword !== confirmPassword){
      setError('Passwords do not match.');
      return;
    }

    const result = await resetPassword(resetEmailOrPhone, resetOtp, newPassword);
    if (result.success){
      setSuccess('Password reset successfully! You can login now.');
      setMode('login');
      setUsername('');
      setPassword(newPassword);
    } else {
      setError(result.message);
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const isDriver = registerForm.role === 'driver';
    if (!registerForm.username || 
        !registerForm.password || 
        !registerForm.name || 
        !registerForm.otp || 
        (!isDriver && !registerForm.email) || 
        (isDriver && !registerForm.phone) || 
        (isDriver && !registerForm.licenseNumber)) {
      setError(isDriver 
        ? 'Please fill in all required fields (including phone number, license number, and OTP).' 
        : 'Please fill in all required fields (including email and OTP).');
      return;
    }

    const result = await registerUser(registerForm);
    if (result.success) {
      setSuccess('Account registered successfully! You can sign in now.');
      setMode('login');
      setUsername(registerForm.username);
      setPassword(registerForm.password);
      setRegisterForm({
        username: '',
        password: '',
        otp: '',
        role: 'parent',
        name: '',
        email: '',
        phone: '',
        licenseNumber: '',
        class: '',
        section: '',
        address: ''
      });
      setOtpSent(false);
      setOtpLoading(false);
    } else {
      setError(result.message);
    }
  };

  const quickLogin = async (user, pass) => {
    setError('');
    setSuccess('');
    const result = await login(user, pass);
    if (!result.success) {
      setError(result.message);
    }
  };

  return (
    <div className="login-page-container">
      <div className="login-wrapper">
        <div className="login-image-column" role="region" aria-label="Smart School Bus Welcome Splash">
          <h1>Smart School Bus</h1>
          <p>Real-time location tracking, smart student check-ins, and emergency transit alerts.</p>
          <div className="bus-animation-container">
            <img src="/school_bus_login.png" alt="Yellow School Bus driving with animated exhaust smoke" className="login-bus-image" />
            <div className="wheel-smoke front-wheel" role="presentation">
              <span className="particle p1"></span>
              <span className="particle p2"></span>
              <span className="particle p3"></span>
            </div>
            <div className="wheel-smoke back-wheel" role="presentation">
              <span className="particle p1"></span>
              <span className="particle p2"></span>
              <span className="particle p3"></span>
            </div>
          </div>
        </div>
        <div className="login-form-column">
          <div className="login-card">
        <div className="login-header">
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.5rem' }}>
            <div style={{ backgroundColor: '#eff6ff', padding: '0.75rem', borderRadius: '50%' }} role="presentation">
              <Bus size={32} color="#3b82f6" aria-hidden="true" />
            </div>
          </div>
          <h2 className="login-title">Smart School Bus</h2>
          <p className="login-subtitle">Transportation Management System</p>
        </div>

        {error && <div className="alert alert-danger" role="alert" aria-live="assertive">{error}</div>}
        {success && <div className="alert alert-success" role="alert" aria-live="polite">{success}</div>}

        {mode === 'login' ? (
          <form onSubmit={handleLoginSubmit} aria-label="Account Sign In">
            <div className="form-group">
              <label className="form-label" htmlFor="username">Username</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  id="username"
                  className="form-input"
                  style={{ paddingLeft: '2.25rem' }}
                  placeholder="Enter username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  aria-required="true"
                />
                <User size={16} color="#94a3b8" style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }} aria-hidden="true" />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="password">Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="password"
                  id="password"
                  className="form-input"
                  style={{ paddingLeft: '2.25rem' }}
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-required="true"
                />
                <Key size={16} color="#94a3b8" style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }} aria-hidden="true" />
              </div>
            </div>

            <button type="submit" className="btn btn-primary btn-block" aria-label="Sign in to your account">Sign In</button>
            
            <div className="login-toggle">
              <div>Forgot password? <span role="button" tabIndex={0} onClick={() => setMode('reset')} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setMode('reset'); }}>Reset it here</span></div>
              <div style={{ marginTop: '0.5rem' }}>Need an account? <span role="button" tabIndex={0} onClick={() => setMode('register')} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setMode('register'); }}>Register here</span></div>
            </div>
          </form>
        ) : mode === 'reset' ? (
          <form onSubmit={handleResetSubmit} aria-label="Reset Password">
             <div className="form-group">
               <label className="form-label" htmlFor="reset-email">Email or Phone Number *</label>
               <div style={{ display: 'flex', gap: '0.5rem' }}>
                 <input
                   type="text"
                   id="reset-email"
                   className="form-input"
                   placeholder="Enter email or phone"
                   required
                   value={resetEmailOrPhone}
                   onChange={(e) => setResetEmailOrPhone(e.target.value)}
                   aria-required="true"
                 />
                  <button 
                    type="button" 
                    className="btn btn-primary" 
                    style={{ whiteSpace: 'nowrap' }}
                    onClick={handleSendResetOtp}
                    disabled={resetOtpLoading || resetOtpCountdown > 0}
                    aria-label="Send verification OTP code to email or phone number"
                  >
                    {resetOtpLoading ? 'Sending...' : resetOtpCountdown > 0 ? `Resend in ${resetOtpCountdown}s` : 'Send OTP'}
                  </button>
               </div>
             </div>

             <div className="form-group">
               <label className="form-label" htmlFor="reset-otp">Enter OTP *</label>
               <input
                 type="text"
                 id="reset-otp"
                 className="form-input"
                 placeholder="Enter 6-digit OTP"
                 required
                 value={resetOtp}
                 onChange={(e) => setResetOtp(e.target.value)}
                 aria-required="true"
               />
             </div>

            <div className="form-group">
              <label className="form-label" htmlFor="new-password">New Password</label>
              <input
                type="password"
                id="new-password"
                className="form-input"
                placeholder="Enter new password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                aria-required="true"
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="confirm-password">Confirm Password</label>
              <input
                type="password"
                id="confirm-password"
                className="form-input"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                aria-required="true"
              />
            </div>

            <button type="submit" className="btn btn-primary btn-block" aria-label="Submit password update">Update Password</button>
            
            <div className="login-toggle">
              Remember credentials? <span role="button" tabIndex={0} onClick={() => setMode('login')} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setMode('login'); }}>Back to Sign In</span>
            </div>
          </form>
        ) : (
          <form onSubmit={handleRegisterSubmit} aria-label="Register New Account">
            <div className="form-group">
              <label className="form-label" htmlFor="reg-name">Full Name *</label>
              <input
                type="text"
                id="reg-name"
                className="form-input"
                placeholder="Enter full name"
                required
                value={registerForm.name}
                onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })}
                aria-required="true"
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="reg-username">Username *</label>
              <input
                type="text"
                id="reg-username"
                className="form-input"
                placeholder="Choose username"
                required
                value={registerForm.username}
                onChange={(e) => setRegisterForm({ ...registerForm, username: e.target.value })}
                aria-required="true"
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="reg-password">Password *</label>
              <input
                type="password"
                id="reg-password"
                className="form-input"
                placeholder="Choose password"
                required
                value={registerForm.password}
                onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })}
                aria-required="true"
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="reg-role">Account Type *</label>
              <select
                id="reg-role"
                className="form-select"
                value={registerForm.role}
                onChange={(e) => setRegisterForm({ ...registerForm, role: e.target.value })}
                aria-required="true"
                aria-label="Account Role Type"
              >
                <option value="parent">Parent / Guardian</option>
                <option value="driver">Bus Driver</option>
              </select>
            </div>

            {registerForm.role !== 'driver' && (
              <div className="form-group">
                <label className="form-label" htmlFor="reg-email">Email Address *</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="email"
                    id="reg-email"
                    className="form-input"
                    placeholder="email@example.com"
                    required
                    value={registerForm.email || ''}
                    onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                    aria-required="true"
                  />
                  <button 
                    type="button" 
                    className="btn btn-primary" 
                    style={{ whiteSpace: 'nowrap' }}
                    onClick={handleSendOtp}
                    disabled={otpLoading || otpCountdown > 0}
                    aria-label="Send verification OTP code to email address"
                  >
                    {otpLoading ? 'Sending...' : otpCountdown > 0 ? `Resend in ${otpCountdown}s` : 'Send OTP'}
                  </button>
                </div>
              </div>
            )}

            {/* Parent Fields */}
            {registerForm.role === 'parent' && (
              <>
                <div className="form-group">
                  <label className="form-label" htmlFor="reg-phone">Phone Number</label>
                  <input
                    type="text"
                    id="reg-phone"
                    className="form-input"
                    placeholder="+1 555-xxxx"
                    value={registerForm.phone || ''}
                    onChange={(e) => setRegisterForm({ ...registerForm, phone: e.target.value })}
                  />
                </div>
              </>
            )}

            {/* Driver Fields */}
            {registerForm.role === 'driver' && (
              <>
                <div className="form-group">
                  <label className="form-label" htmlFor="reg-driver-phone">Phone Number *</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      type="text"
                      id="reg-driver-phone"
                      className="form-input"
                      placeholder="+1 555-xxxx"
                      required
                      value={registerForm.phone || ''}
                      onChange={(e) => setRegisterForm({ ...registerForm, phone: e.target.value })}
                      aria-required="true"
                    />
                    <button 
                      type="button" 
                      className="btn btn-primary" 
                      style={{ whiteSpace: 'nowrap' }}
                      onClick={handleSendOtp}
                      disabled={otpLoading || otpCountdown > 0}
                      aria-label="Send verification OTP code to driver phone number"
                    >
                      {otpLoading ? 'Sending...' : otpCountdown > 0 ? `Resend in ${otpCountdown}s` : 'Send OTP to Phone'}
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Enter OTP Field (always renders below the Phone Number field) */}
            <div className="form-group">
              <label className="form-label" htmlFor="reg-otp">Enter OTP *</label>
              <input
                type="text"
                id="reg-otp"
                className="form-input"
                placeholder="Enter 6-digit OTP"
                required
                value={registerForm.otp || ''}
                onChange={(e) => setRegisterForm({ ...registerForm, otp: e.target.value })}
                aria-required="true"
              />
            </div>

            {/* License Number (Driver only, renders below Enter OTP) */}
            {registerForm.role === 'driver' && (
              <div className="form-group">
                <label className="form-label" htmlFor="reg-license">License Number *</label>
                <input
                  type="text"
                  id="reg-license"
                  className="form-input"
                  placeholder="DL-xxxxxx"
                  required
                  value={registerForm.licenseNumber || ''}
                  onChange={(e) => setRegisterForm({ ...registerForm, licenseNumber: e.target.value })}
                  aria-required="true"
                />
              </div>
            )}



            <button type="submit" className="btn btn-primary btn-block" style={{ marginTop: '0.5rem' }} aria-label="Create account and submit registration">Create Account</button>
            
            <div className="login-toggle">
              Already have an account? <span role="button" tabIndex={0} onClick={() => setMode('login')} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setMode('login'); }}>Sign In here</span>
            </div>
          </form>
        )}

        <div className="quick-login-list" role="region" aria-label="Demo Quick Access Presets">
          <div className="quick-login-title">
            <ShieldAlert size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} aria-hidden="true" />
            Demo Accounts (Password: password)
          </div>
          <div className="quick-login-grid" role="group" aria-label="Demo login shortcuts">
            <button className="quick-login-btn" onClick={() => quickLogin('schooladmin', 'password')} aria-label="Quick log in as School Administrator">
              <strong>School Admin</strong>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>User: schooladmin</div>
            </button>
            <button className="quick-login-btn" onClick={() => quickLogin('driver1', 'password')} aria-label="Quick log in as Driver John Doe">
              <strong>Driver</strong>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>User: driver1</div>
            </button>
            <button className="quick-login-btn" onClick={() => quickLogin('parent1', 'password')} aria-label="Quick log in as Parent Robert Johnson">
              <strong>Parent</strong>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>User: parent1</div>
            </button>

          </div>
        </div>
      </div>
      </div>
      </div>
    </div>
  );
}
