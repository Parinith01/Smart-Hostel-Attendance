import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { 
  User, Lock, Phone, Mail, Home, Shield, LogOut, CheckCircle, XCircle, 
  AlertTriangle, RefreshCw, Search, Filter, Calendar, Users, 
  CalendarDays, Award, Clock, FileSpreadsheet, FileText, ShieldAlert, Key, Utensils,
  Eye, EyeOff, Sun, Moon, Upload, Camera, CameraOff, Fingerprint
} from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';

// API Configuration
const API_BASE = import.meta.env.VITE_API_BASE || (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname.match(/^192\.168\.|^10\.|^172\.(1[6-9]|2[0-9]|3[0-1])\./)) ? `http://${window.location.hostname}:5000/api` : 'https://jss-hostel-backend.vercel.app/api');

// Simple Alert Component
const Alert = ({ type = 'info', children }) => {
  const styles = {
    error: { bg: 'rgba(248, 81, 73, 0.15)', border: '1px solid rgba(248, 81, 73, 0.3)', color: '#ff7b72' },
    success: { bg: 'rgba(63, 185, 80, 0.15)', border: '1px solid rgba(63, 185, 80, 0.3)', color: '#56d364' },
    warning: { bg: 'rgba(240, 136, 62, 0.15)', border: '1px solid rgba(240, 136, 62, 0.3)', color: '#f0883e' },
    info: { bg: 'rgba(88, 166, 255, 0.15)', border: '1px solid rgba(88, 166, 255, 0.3)', color: '#58a6ff' }
  };
  const activeStyle = styles[type] || styles.info;
  return (
    <div style={{
      padding: '0.75rem 1rem',
      borderRadius: '8px',
      fontSize: '0.9rem',
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      marginBottom: '1rem',
      backgroundColor: activeStyle.bg,
      border: activeStyle.border,
      color: activeStyle.color,
      animation: 'fadeIn 0.3s ease'
    }}>
      <AlertTriangle size={18} style={{ flexShrink: 0 }} />
      <span>{children}</span>
    </div>
  );
};

// Custom Helper to generate or retrieve device fingerprint
const getDeviceFingerprint = () => {
  let fingerprint = localStorage.getItem('hostel_device_fingerprint');
  if (!fingerprint) {
    // Generate high-entropy ID simulating device fingerprint
    const screenInfo = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`;
    const userAgent = navigator.userAgent.replace(/[^a-zA-Z0-9]/g, '').substring(0, 30);
    const rand = Math.random().toString(36).substring(2, 10);
    fingerprint = `dev_${screenInfo}_${userAgent}_${rand}`;
    localStorage.setItem('hostel_device_fingerprint', fingerprint);
  }
  return fingerprint;
};

// Beautiful custom CAPTCHA Component
const CaptchaWidget = ({ onVerify }) => {
  const [num1, setNum1] = useState(0);
  const [num2, setNum2] = useState(0);
  const [userVal, setUserVal] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    resetChallenge();
  }, []);

  // Declare as a function so it is hoisted and accessible in the useEffect above
  function resetChallenge() {
    setNum1(Math.floor(Math.random() * 9) + 1);
    setNum2(Math.floor(Math.random() * 9) + 1);
    setUserVal('');
    setIsSuccess(false);
    setError(false);
    onVerify(false);
  }

  const handleCheck = () => {
    if (parseInt(userVal) === num1 + num2) {
      setIsSuccess(true);
      setError(false);
      onVerify(true);
    } else {
      setError(true);
      onVerify(false);
    }
  };

  return (
    <div style={{
      background: 'rgba(13, 17, 23, 0.8)',
      border: '1px solid var(--border-color)',
      padding: '0.75rem 1rem',
      borderRadius: '8px',
      margin: '1rem 0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '0.5rem'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <Shield size={18} className="text-secondary" />
        <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
          Security CAPTCHA: <strong style={{ color: 'var(--accent-blue)' }}>{num1} + {num2} = ?</strong>
        </span>
      </div>
      {isSuccess ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--accent-green)', fontSize: '0.85rem', fontWeight: 600 }}>
          <CheckCircle size={16} /> Verified
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="number"
            className="input-field"
            style={{ width: '60px', padding: '0.25rem 0.5rem', textAlign: 'center' }}
            value={userVal}
            onChange={(e) => setUserVal(e.target.value)}
            placeholder="Sum"
          />
          <button type="button" className="btn btn-secondary" style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem' }} onClick={handleCheck}>
            Verify
          </button>
        </div>
      )}
      {error && <div style={{ color: 'var(--accent-red)', fontSize: '0.75rem', position: 'absolute', transform: 'translateY(32px)' }}>Incorrect value.</div>}
    </div>
  );
};

// DEV floating OTP helper component (Disabled)
const DevOtpHelper = () => {
  return null;
};

// ==========================================
// A. AUTHENTICATION PAGES
// ==========================================

// Login Component
const Login = () => {
  const [searchParams] = useSearchParams();
  const initialType = searchParams.get('type') || 'select'; // 'select', 'student', 'admin'
  
  const [view, setView] = useState(initialType);
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Reset inputs when switching view
  useEffect(() => {
    setError('');
    setUserId('');
    setPassword('');
  }, [view]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!userId || !password) return setError('User ID and Password are required.');
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, password })
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Login failed.');
      }

      sessionStorage.setItem('hms_user', JSON.stringify(data.user));
      sessionStorage.setItem('hms_token', data.token);
      
      if (data.user.role === 'admin') {
        if (view === 'student') {
          setError('Invalid login credentials for Student Portal.');
          sessionStorage.clear();
        } else {
          navigate('/admin');
        }
      } else {
        if (view === 'admin') {
          setError('Unauthorized access. This panel is restricted to system administrators.');
          sessionStorage.clear();
        } else {
          navigate('/student');
        }
      }

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFingerprintLogin = async () => {
    if (!userId) return setError('Please enter your Student ID first to login with biometric fingerprint.');
    setError('');
    setLoading(true);

    try {
      // 1. Get Authentication Options from server
      const optRes = await fetch(`${API_BASE}/auth/webauthn/login-options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      const options = await optRes.json();
      
      if (!optRes.ok) {
        throw new Error(options.error || 'Failed to get biometric options. Have you registered this device?');
      }

      // 2. Trigger native biometric prompt
      let asseResp;
      try {
        asseResp = await startAuthentication(options);
      } catch (e) {
        throw new Error('Biometric prompt cancelled or failed.');
      }

      // 3. Verify Authentication Response on server
      const verifyRes = await fetch(`${API_BASE}/auth/webauthn/login-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, response: asseResp })
      });
      const verifyData = await verifyRes.json();

      if (!verifyRes.ok) {
        throw new Error(verifyData.error || 'Biometric verification failed.');
      }

      sessionStorage.setItem('hms_user', JSON.stringify(verifyData.user));
      sessionStorage.setItem('hms_token', verifyData.token);
      
      navigate('/student');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (view === 'select') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '90vh', padding: '2rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <h1 style={{ fontSize: '2.4rem', marginBottom: '0.5rem', fontWeight: 900, color: 'var(--cyan)', letterSpacing: '0.05em', textShadow: '0 0 15px rgba(0, 229, 255, 0.3)' }}>JSS MAIN BUILDING BOYS HOSTEL</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', letterSpacing: '0.08em', fontWeight: 600, textTransform: 'uppercase', margin: 0 }}>smart attendence system login dashobard</p>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2rem', width: '100%', maxWidth: '720px', justifyContent: 'center' }}>
          {/* Student Gate Card */}
          <div 
            onClick={() => setView('student')}
            className="glass-panel" 
            style={{ 
              padding: '3rem 2rem', 
              textAlign: 'center', 
              cursor: 'pointer', 
              border: '1px solid rgba(0, 229, 255, 0.15)',
              transition: 'all 0.3s ease',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
              borderRadius: '12px',
              flex: '1 1 280px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.border = '1px solid var(--cyan)';
              e.currentTarget.style.boxShadow = '0 0 25px rgba(0, 229, 255, 0.35)';
              e.currentTarget.style.transform = 'translateY(-5px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.border = '1px solid rgba(0, 229, 255, 0.15)';
              e.currentTarget.style.boxShadow = '0 8px 32px 0 rgba(0, 0, 0, 0.37)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <div style={{ background: 'rgba(0, 229, 255, 0.08)', border: '2px solid var(--cyan)', borderRadius: '50%', width: '80px', height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem', boxShadow: '0 0 15px rgba(0, 229, 255, 0.4)' }}>
              <User size={36} style={{ color: 'var(--cyan)' }} />
            </div>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '0.08em' }}>STUDENT</h3>
          </div>

          {/* Admin Gate Card */}
          <div 
            onClick={() => setView('admin')}
            className="glass-panel" 
            style={{ 
              padding: '3rem 2rem', 
              textAlign: 'center', 
              cursor: 'pointer', 
              border: '1px solid rgba(233, 30, 99, 0.15)',
              transition: 'all 0.3s ease',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
              borderRadius: '12px',
              flex: '1 1 280px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.border = '1px solid var(--pink)';
              e.currentTarget.style.boxShadow = '0 0 25px rgba(233, 30, 99, 0.35)';
              e.currentTarget.style.transform = 'translateY(-5px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.border = '1px solid rgba(233, 30, 99, 0.15)';
              e.currentTarget.style.boxShadow = '0 8px 32px 0 rgba(0, 0, 0, 0.37)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <div style={{ background: 'rgba(233, 30, 99, 0.08)', border: '2px solid var(--pink)', borderRadius: '50%', width: '80px', height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem', boxShadow: '0 0 15px rgba(233, 30, 99, 0.4)' }}>
              <Shield size={36} style={{ color: 'var(--pink)' }} />
            </div>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '0.08em' }}>ADMIN</h3>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '90vh', padding: '2rem' }}>
      <div className="glass-panel animate-fade-in" style={{ width: '100%', maxWidth: '420px', padding: '2.5rem 2rem', border: view === 'admin' ? '1px solid rgba(233, 30, 99, 0.25)' : '1px solid rgba(0, 229, 255, 0.25)' }}>
        <button 
          type="button" 
          onClick={() => setView('select')} 
          style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '1.5rem', padding: 0 }}
        >
          &larr; Back to Selection
        </button>

        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '2.2rem', marginBottom: '0.5rem', fontWeight: 800, color: view === 'admin' ? 'var(--pink)' : 'var(--cyan)' }}>
            {view === 'admin' ? 'Admin Core' : 'JSS Hostel Hub'}
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            {view === 'admin' ? 'Secure Management Gateway' : 'Student Portal Access'}
          </p>
        </div>

        {error && <Alert type="error">{error}</Alert>}

        <form onSubmit={handleLogin}>
          <div className="input-group">
            <label className="input-label">
              {view === 'admin' ? 'Admin User ID' : 'Student User ID'}
            </label>
            <div style={{ position: 'relative' }}>
              <User size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input
                type="text"
                className="input-field"
                style={{ paddingLeft: '2.5rem' }}
                value={userId}
                onChange={(e) => setUserId(e.target.value.replace(/[^a-zA-Z0-9#]/g, '').substring(0, 8))}
                placeholder={view === 'admin' ? "Admin ID" : "Student ID"}
                maxLength={8}
                required
              />
            </div>
          </div>

          <div className="input-group" style={{ marginBottom: '1.5rem' }}>
            <label className="input-label">Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input
                type={showPassword ? "text" : "password"}
                className="input-field"
                style={{ paddingLeft: '2.5rem', paddingRight: '2.5rem' }}
                value={password}
                onChange={(e) => setPassword(e.target.value.substring(0, 12))}
                placeholder="Password"
                maxLength={12}
                required
              />
              <button 
                type="button" 
                onClick={() => setShowPassword(!showPassword)} 
                style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div style={{ textAlign: 'right', marginBottom: '1.5rem' }}>
            <a href="/forgot-password" style={{ color: 'var(--accent-blue)', fontSize: '0.85rem', textDecoration: 'none' }}>Forgot Password?</a>
          </div>

          <button type="submit" className={view === 'admin' ? "btn btn-pink" : "btn btn-primary"} style={{ width: '100%', padding: '0.85rem' }} disabled={loading}>
            {loading ? 'Authenticating...' : (view === 'admin' ? 'Sign In to Core' : 'Sign In')}
          </button>
          
          {view === 'student' && (
            <button 
              type="button" 
              className="btn btn-secondary" 
              style={{ width: '100%', padding: '0.85rem', marginTop: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }} 
              disabled={loading}
              onClick={handleFingerprintLogin}
            >
              <Fingerprint size={18} style={{ color: 'var(--cyan)' }} />
              Sign in with Device Fingerprint
            </button>
          )}
        </form>

        {view === 'student' && (
          <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.85rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>New resident? </span>
            <a href="/register" style={{ color: 'var(--accent-blue)', fontWeight: 600, textDecoration: 'none' }}>Register Account</a>
          </div>
        )}
      </div>
    </div>
  );
};

// Register Component
const Register = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    room_number: '',
    block: '',
    join_year: new Date().getFullYear(),
    leaving_year: new Date().getFullYear() + 4,
    password: '',
    confirmPassword: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [captchaVerified, setCaptchaVerified] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      return setError('Passwords do not match.');
    }
    if (!captchaVerified) {
      return setError('Please verify the security CAPTCHA.');
    }
    setError('');
    setLoading(true);

    try {
      const payload = {
        ...formData,
        fingerprint: getDeviceFingerprint()
      };

      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Registration failed.');
      }

      // Navigate to OTP page passing user ID and email
      navigate(`/verify?email=${encodeURIComponent(data.email)}&userId=${encodeURIComponent(data.userId)}`);

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '2rem 0' }}>
      <div className="glass-panel animate-fade-in" style={{ width: '100%', maxWidth: '520px', padding: '2.5rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '2rem', marginBottom: '0.5rem', fontWeight: 800 }}>Resident Registration</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Join the JSS Hostel Community Portal</p>
        </div>

        {error && <Alert type="error">{error}</Alert>}

        <form onSubmit={handleRegister}>
          <div className="input-group">
            <label className="input-label">Full Name</label>
            <div style={{ position: 'relative' }}>
              <User size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input
                type="text"
                name="name"
                className="input-field"
                style={{ paddingLeft: '2.5rem' }}
                value={formData.name}
                onChange={handleChange}
                placeholder="John Doe"
                required
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="input-group">
              <label className="input-label">Email ID</label>
              <div style={{ position: 'relative' }}>
                <Mail size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                <input
                  type="email"
                  name="email"
                  className="input-field"
                  style={{ paddingLeft: '2.5rem' }}
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="john@example.com"
                  required
                />
              </div>
            </div>

            <div className="input-group">
              <label className="input-label">Phone Number</label>
              <div style={{ position: 'relative' }}>
                <Phone size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                <input
                  type="tel"
                  name="phone"
                  className="input-field"
                  style={{ paddingLeft: '2.5rem' }}
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value.replace(/[^0-9]/g, '').substring(0, 10)})}
                  placeholder="10-digit number"
                  maxLength={10}
                  required
                />
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="input-group">
              <label className="input-label">Room Number</label>
              <input
                type="text"
                name="room_number"
                className="input-field"
                value={formData.room_number}
                onChange={handleChange}
                placeholder="302"
                required
              />
            </div>

            <div className="input-group">
              <label className="input-label">Block / Building</label>
              <input
                type="text"
                name="block"
                className="input-field"
                value={formData.block}
                onChange={handleChange}
                placeholder="B-Block"
                required
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="input-group">
              <label className="input-label">Joining Year</label>
              <input
                type="number"
                name="join_year"
                className="input-field"
                value={formData.join_year}
                onChange={handleChange}
                min="2020"
                max="2035"
                required
              />
            </div>

            <div className="input-group">
              <label className="input-label">Leaving Year</label>
              <input
                type="number"
                name="leaving_year"
                className="input-field"
                value={formData.leaving_year}
                onChange={handleChange}
                min={formData.join_year || 2020}
                max="2040"
                required
              />
              <span style={{ fontSize: '0.65rem', color: 'var(--text-3)', marginTop: '-0.3rem' }}>Auto-exit when year expires</span>
            </div>
          </div>

          <div className="input-group">
            <label className="input-label">Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                className="input-field"
                style={{ paddingLeft: '2.5rem', paddingRight: '2.5rem' }}
                value={formData.password}
                onChange={(e) => setFormData({...formData, password: e.target.value.substring(0, 12)})}
                placeholder="12 characters max"
                maxLength={12}
                required
              />
              <button 
                type="button" 
                onClick={() => setShowPassword(!showPassword)} 
                style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="input-group">
            <label className="input-label">Confirm Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input
                type={showConfirmPassword ? "text" : "password"}
                name="confirmPassword"
                className="input-field"
                style={{ paddingLeft: '2.5rem', paddingRight: '2.5rem' }}
                value={formData.confirmPassword}
                onChange={(e) => setFormData({...formData, confirmPassword: e.target.value.substring(0, 12)})}
                placeholder="Confirm Password"
                maxLength={12}
                required
              />
              <button 
                type="button" 
                onClick={() => setShowConfirmPassword(!showConfirmPassword)} 
                style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              >
                {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <CaptchaWidget onVerify={setCaptchaVerified} />

          <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '0.85rem', marginTop: '1rem' }} disabled={loading}>
            {loading ? 'Processing Registration...' : 'Create Account'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.85rem' }}>
          <span style={{ color: 'var(--text-secondary)' }}>Already registered? </span>
          <a href="/login" style={{ color: 'var(--accent-blue)', fontWeight: 600, textDecoration: 'none' }}>Sign In here</a>
        </div>
      </div>

      <DevOtpHelper email={formData.email} />
    </div>
  );
};

// Verification / OTP Component
const VerifyOTP = () => {
  const [searchParams] = useSearchParams();
  const email = searchParams.get('email') || '';
  const userId = searchParams.get('userId') || '';
  
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [resendCooldown, setResendCooldown] = useState(60);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let timer;
    if (resendCooldown > 0) {
      timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleVerify = async (e) => {
    e.preventDefault();
    if (!otp) return setError('OTP code is required.');
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Verification failed.');
      }

      setSuccess(data.message);
      setTimeout(() => {
        navigate('/login');
      }, 3000);

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setError('');
    setSuccess('');

    try {
      const res = await fetch(`${API_BASE}/auth/resend-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Resend failed.');
      }

      setSuccess('Verification OTP resent successfully!');
      setResendCooldown(60);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '90vh', padding: '1.5rem' }}>
      <div className="glass-panel animate-fade-in" style={{ width: '100%', maxWidth: '440px', padding: '2.5rem 2rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.75rem', marginBottom: '0.5rem', fontWeight: 800 }}>Confirm Email</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            We've sent a 6-digit OTP code to <strong style={{ color: 'var(--text-primary)' }}>{email}</strong>
          </p>
          {userId && (
            <div style={{ margin: '0.75rem 0', background: 'rgba(255, 255, 255, 0.05)', padding: '0.5rem', borderRadius: '6px', fontSize: '0.85rem' }}>
              Your auto-generated User ID is: <strong style={{ color: 'var(--accent-blue)' }}>{userId}</strong>
            </div>
          )}
        </div>

        {error && <Alert type="error">{error}</Alert>}
        {success && <Alert type="success">{success}</Alert>}

        <form onSubmit={handleVerify}>
          <div className="input-group">
            <label className="input-label" style={{ textAlign: 'center', display: 'block', fontSize: '0.9rem' }}>Enter 6-Digit OTP</label>
            <input
              type="text"
              maxLength="6"
              className="input-field"
              style={{ textAlign: 'center', fontSize: '1.75rem', letterSpacing: '8px', padding: '0.5rem', fontWeight: 700 }}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="000000"
              required
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '0.85rem', marginTop: '0.5rem' }} disabled={loading}>
            {loading ? 'Verifying...' : 'Verify Code'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.85rem' }}>
          <span style={{ color: 'var(--text-secondary)' }}>Didn't receive the email? </span>
          <button
            onClick={handleResend}
            style={{ background: 'none', border: 'none', color: resendCooldown > 0 ? 'var(--text-muted)' : 'var(--accent-blue)', fontWeight: 600, cursor: resendCooldown > 0 ? 'not-allowed' : 'pointer' }}
            disabled={resendCooldown > 0}
          >
            Resend OTP {resendCooldown > 0 ? `(${resendCooldown}s)` : ''}
          </button>
        </div>
      </div>

      <DevOtpHelper email={email} />
    </div>
  );
};

// Forgot Password Component
const ForgotPassword = () => {
  const [step, setStep] = useState(1); // 1 = input uid & email, 2 = input OTP & new pass
  const [userId, setUserId] = useState('');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleRequestOtp = async (e) => {
    e.preventDefault();
    if (!userId || !email) return setError('User ID and email are required.');
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, email })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Operation failed.');
      }

      setSuccess('Verification reset OTP code has been sent.');
      setTimeout(() => {
        setStep(2);
        setSuccess('');
      }, 1500);

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    if (!otp || !newPassword || !confirmPassword) return setError('All fields are required.');
    if (newPassword !== confirmPassword) return setError('Passwords do not match.');
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, email, otp, newPassword, confirmPassword })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Password reset failed.');
      }

      setSuccess(data.message);
      setTimeout(() => {
        navigate('/login');
      }, 2500);

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '90vh', padding: '1.5rem' }}>
      <div className="glass-panel animate-fade-in" style={{ width: '100%', maxWidth: '440px', padding: '2.5rem 2rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.75rem', marginBottom: '0.5rem', fontWeight: 800 }}>Reset Password</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            {step === 1 ? 'Verify account credentials to receive OTP' : 'Enter OTP code and setup your new password'}
          </p>
        </div>

        {error && <Alert type="error">{error}</Alert>}
        {success && <Alert type="success">{success}</Alert>}

        {step === 1 ? (
          <form onSubmit={handleRequestOtp}>
            <div className="input-group">
              <label className="input-label">User ID</label>
              <div style={{ position: 'relative' }}>
                <Key size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                <input
                  type="text"
                  className="input-field"
                  style={{ paddingLeft: '2.5rem' }}
                  value={userId}
                  onChange={(e) => setUserId(e.target.value.replace(/[^a-zA-Z0-9#]/g, '').substring(0, 8))}
                  placeholder="User ID"
                  maxLength={8}
                  required
                />
              </div>
            </div>

            <div className="input-group" style={{ marginBottom: '1.5rem' }}>
              <label className="input-label">Registered Email</label>
              <div style={{ position: 'relative' }}>
                <Mail size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                <input
                  type="email"
                  className="input-field"
                  style={{ paddingLeft: '2.5rem' }}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="john@example.com"
                  required
                />
              </div>
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '0.85rem' }} disabled={loading}>
              {loading ? 'Sending OTP...' : 'Send Verification OTP'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleReset}>
            <div className="input-group">
              <label className="input-label">6-Digit OTP Code</label>
              <input
                type="text"
                className="input-field"
                style={{ textAlign: 'center', letterSpacing: '4px', fontWeight: 700 }}
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="000000"
                maxLength="6"
                autoComplete="one-time-code"
                required
              />
            </div>

            <div className="input-group">
              <label className="input-label">New Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? "text" : "password"}
                  className="input-field"
                  style={{ paddingRight: '2.5rem' }}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value.substring(0, 12))}
                  placeholder="New Password"
                  maxLength={12}
                  autoComplete="new-password"
                  required
                />
                <button 
                  type="button" 
                  onClick={() => setShowPassword(!showPassword)} 
                  style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="input-group" style={{ marginBottom: '1.5rem' }}>
              <label className="input-label">Confirm New Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  className="input-field"
                  style={{ paddingRight: '2.5rem' }}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value.substring(0, 12))}
                  placeholder="Confirm New Password"
                  maxLength={12}
                  autoComplete="new-password"
                  required
                />
                <button 
                  type="button" 
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)} 
                  style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                >
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '0.85rem' }} disabled={loading}>
              {loading ? 'Saving Password...' : 'Reset Password'}
            </button>
          </form>
        )}

        <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.85rem' }}>
          <a href="/login" style={{ color: 'var(--accent-blue)', textDecoration: 'none' }}>Return to Login</a>
        </div>
      </div>

      {step === 1 && email && <DevOtpHelper email={email} />}
      {step === 2 && email && <DevOtpHelper email={email} />}
    </div>
  );
};


// ==========================================
// B. STUDENT DASHBOARD
// ==========================================

const StudentDashboard = () => {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('attendance');
  const [cfg, setCfg] = useState(null);
  const [myToken, setMyToken] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [returnMeal, setReturnMeal] = useState('breakfast');
  const [leaveStart, setLeaveStart] = useState('');
  const [leaveEnd, setLeaveEnd] = useState('');
  const [leaveReturnMeal, setLeaveReturnMeal] = useState('breakfast');
  const [cpCur, setCpCur] = useState('');
  const [cpNew, setCpNew] = useState('');
  const [cpCon, setCpCon] = useState('');
  const [showCurPass, setShowCurPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConPass, setShowConPass] = useState(false);
  const [selectedAbsenceMeal, setSelectedAbsenceMeal] = useState(null);
  const navigate = useNavigate();

  const token = () => sessionStorage.getItem('hms_token');
  const hdrs = (json=true) => {
    const h = {}; if(json) h['Content-Type']='application/json';
    if(token()) h['Authorization']=`Bearer ${token()}`; return h;
  };
  const apiFetch = async (url,opts={}) => {
    const res = await fetch(url,{...opts, credentials:'include', headers:{...hdrs(),...(opts.headers||{})}});
    if(res.status===401||res.status===403){navigate('/login');throw new Error('Not authenticated');}
    const d = await res.json();
    if(!res.ok) throw new Error(d.error||'Error');
    return d;
  };

  const isInWindow = (meal) => {
    if(!cfg) return true;
    const now = new Date();
    const cur = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    return meal==='breakfast' ? (cur>=cfg.breakfast_start&&cur<=cfg.breakfast_end)
                              : (cur>=cfg.dinner_start&&cur<=cfg.dinner_end);
  };

  const loadAll = async () => {
    try {
      const [d,c,t] = await Promise.all([
        apiFetch(`${API_BASE}/student/dashboard`),
        fetch(`${API_BASE.replace('/api','')}/api/config/system`).then(r=>r.json()),
        apiFetch(`${API_BASE}/student/my-token`)
      ]);
      setData(d); setCfg(c.config||null); setMyToken(t.token||null);
    } catch(e){ setError(e.message); }
  };

  useEffect(()=>{ loadAll(); },[]);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const t = await apiFetch(`${API_BASE}/student/my-token`);
        if (t && t.token) {
          if (!myToken || t.token.is_redeemed !== myToken.is_redeemed || t.token.isExpired !== myToken.isExpired || t.token.token_number !== myToken.token_number) {
            setMyToken(t.token);
          }
        } else if (myToken) {
          setMyToken(null);
        }
      } catch (e) {
        // Suppress interval logs to keep developer console clean
      }
    }, 20000);

    return () => clearInterval(interval);
  }, [myToken]);

  const vote = async (meal_type, status) => {
    setError(''); setSuccess('');
    try {
      await apiFetch(`${API_BASE}/student/vote`,{method:'POST',body:JSON.stringify({meal_type,status})});
      setSuccess(`Voted ${status} for ${meal_type}.`);
      loadAll();
    } catch(e){ setError(e.message); }
  };

  const submitAbsence = async (e) => {
    e.preventDefault(); setError(''); setSuccess('');
    try {
      await apiFetch(`${API_BASE}/student/absence`,{method:'POST',body:JSON.stringify({meal_type:returnMeal})});
      setSuccess('Absence registered successfully for today.');
      setSelectedAbsenceMeal(null);
      loadAll();
    } catch(e){ setError(e.message); }
  };

  const submitLeave = async (e) => {
    e.preventDefault(); setError(''); setSuccess('');
    try {
      await apiFetch(`${API_BASE}/student/leave`,{method:'POST',body:JSON.stringify({start_date:leaveStart,end_date:leaveEnd,return_meal:leaveReturnMeal})});
      setSuccess('Long leave request submitted.'); setLeaveStart(''); setLeaveEnd(''); loadAll();
    } catch(e){ setError(e.message); }
  };

  const changePassword = async (e) => {
    e.preventDefault(); setError(''); setSuccess('');
    try {
      await apiFetch(`${API_BASE}/student/change-password`,{method:'PUT',body:JSON.stringify({currentPassword:cpCur,newPassword:cpNew,confirmPassword:cpCon})});
      setSuccess('Password changed successfully.'); setCpCur(''); setCpNew(''); setCpCon('');
    } catch(e){ setError(e.message); }
  };

  const logout = async () => {
    await fetch(`${API_BASE}/auth/logout`,{method:'POST',credentials:'include'});
    sessionStorage.clear(); navigate('/login');
  };

  if(!data) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',flexDirection:'column',gap:'1rem'}}>
      <RefreshCw size={36} className="animate-spin text-cyan"/>
      <p className="text-muted" style={{fontSize:'.85rem'}}>Loading portal...</p>
    </div>
  );

  const {profile,votes,absencesRemaining,leaves} = data;
  const absUsed = 8 - absencesRemaining;

  const MealCard = ({meal,icon,timeKey}) => {
    const start = cfg?.[`${meal}_start`]||'--:--';
    const end   = cfg?.[`${meal}_end`]||'--:--';
    const inWin = isInWindow(meal);
    const voteVal = votes[meal];
    return (
      <div className="meal-card">
        <div className="meal-card-head">
          <div className="meal-card-title" style={{color:meal==='breakfast'?'var(--cyan)':'var(--pink)'}}>
            <span>{icon}</span>{meal.toUpperCase()}
          </div>
          <span className="meal-time">{start} - {end}</span>
        </div>
        {voteVal==='Absent' ? (
          <div className="meal-voted-msg meal-voted-absent">MARKED ABSENT</div>
        ) : voteVal==='Present' ? (
          <div className="meal-voted-msg meal-voted-present">✓ MARKED PRESENT</div>
        ) : !inWin ? (
          <div className="meal-locked-msg">Voting window closed ({start} - {end})</div>
        ) : (
          <div className="meal-btn-row">
            <button className="btn btn-success" onClick={()=>vote(meal,'Present')}>I AM PRESENT</button>
            <button className="btn btn-danger"  onClick={()=>{ setReturnMeal(meal); setSelectedAbsenceMeal(meal); }}>I AM ABSENT</button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="sp-bg">
      <div className="sp-card animate-fade-in">
        {/* Header */}
        <div className="sp-header">
          <button className="sp-logout-btn" onClick={logout} title="Sign Out" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <LogOut size={16} />
          </button>
          <div className="sp-icon-wrap">
            <Utensils size={28} style={{ color: 'var(--cyan)' }} />
          </div>
          <h1 className="sp-title">JSS Hostel Hub</h1>
          <p className="sp-subtitle">Student Portal</p>
          <p style={{fontSize:'.75rem',color:'var(--text-3)',marginTop:'.4rem',fontFamily:'var(--font-mono)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', flexWrap: 'wrap'}}>
            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{profile.name}</span>
            <span style={{ fontSize: '0.65rem', color: 'var(--green)', fontWeight: 800, background: 'rgba(63, 185, 80, 0.1)', border: '1px solid rgba(63, 185, 80, 0.3)', padding: '1px 5px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
              <CheckCircle size={10} /> VERIFIED RESIDENT
            </span>
            <span style={{ color: 'var(--text-3)' }}>·</span>
            <span>Room {profile.room_number}</span>
            <span style={{ color: 'var(--text-3)' }}>·</span>
            <span>{profile.block}</span>
          </p>
        </div>

        {/* Absences Bar */}
        <div className="sp-absences">
          <div className="sp-abs-row">
            <span>Monthly Absences</span>
            <span className="sp-abs-val">{absUsed} / 8</span>
          </div>
          <div className="sp-progress">
            <div className="sp-progress-fill" style={{width:`${(absUsed/8)*100}%`}}/>
          </div>
        </div>

        {/* Tabs */}
        <div className="sp-tabs">
          {[
            { id: 'attendance', label: 'Attendance', icon: <Utensils size={14} style={{ marginRight: '6px' }} /> },
            { id: 'leave', label: 'Leave', icon: <CalendarDays size={14} style={{ marginRight: '6px' }} /> },
            { id: 'password', label: 'Security', icon: <Shield size={14} style={{ marginRight: '6px' }} /> }
          ].map((t) => (
            <button 
              key={t.id} 
              className={`sp-tab ${tab === t.id ? 'active' : ''}`} 
              onClick={() => { setTab(t.id); setError(''); setSuccess(''); }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              {t.icon}
              <span>{t.label.toUpperCase()}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="sp-content">
          {error   && <div className="alert alert-error"><AlertTriangle size={14}/>{error}</div>}
          {success && <div className="alert alert-success"><CheckCircle size={14}/>{success}</div>}

          {tab==='attendance' && (<>
            {myToken && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', margin: '1rem 0' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '2rem', alignItems: 'center' }}>
                  {/* Front/Visual Token */}
                  <div className="round-token-container animate-fade-in" style={{ padding: 0 }}>
                    <div className={`round-token ${myToken.isExpired ? 'expired' : ''} ${myToken.is_redeemed ? 'redeemed' : ''}`} style={{
                      borderColor: myToken.is_redeemed ? 'var(--green)' : undefined,
                      boxShadow: myToken.is_redeemed ? '0 0 30px rgba(63, 185, 80, 0.25), inset 0 0 25px rgba(63, 185, 80, 0.15)' : undefined
                    }}>
                      <div className="round-token-outer-ring" style={{
                        borderColor: myToken.is_redeemed ? 'rgba(63, 185, 80, 0.4)' : undefined
                      }}></div>
                      <div className="round-token-inner-ring"></div>
                      <div className="round-token-text-top" style={{
                        color: myToken.is_redeemed ? 'var(--green)' : undefined,
                        textShadow: myToken.is_redeemed ? '0 0 8px rgba(63, 185, 80, 0.4)' : undefined
                      }}>JSS HOSTEL PASS</div>
                      <div className="round-token-num-wrap">
                        <span className="round-token-hash">TOKEN</span>
                        <span className="round-token-num" style={{
                          textShadow: myToken.is_redeemed ? '0 0 20px var(--green)' : undefined
                        }}>#{myToken.token_number}</span>
                      </div>
                      <div className="round-token-text-bot" style={{
                        color: myToken.is_redeemed ? 'var(--green)' : undefined,
                        textShadow: myToken.is_redeemed ? '0 0 10px rgba(63, 185, 80, 0.4)' : undefined
                      }}>{myToken.token_for_meal}</div>
                      {myToken.isExpired && (
                        <div className="expired-stamp-overlay">EXPIRED</div>
                      )}
                      {myToken.is_redeemed && (
                        <div className="expired-stamp-overlay" style={{ borderColor: 'var(--green)', color: 'var(--green)' }}>USED</div>
                      )}
                    </div>
                  </div>

                  {/* QR Code Card */}
                  <div className="card animate-fade-in" style={{
                    width: '230px',
                    height: '230px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(255, 255, 255, 0.01)',
                    border: `2px solid ${myToken.is_redeemed ? 'var(--green)' : myToken.isExpired ? 'var(--red)' : 'var(--cyan)'}`,
                    borderRadius: '16px',
                    padding: '1rem',
                    boxShadow: myToken.is_redeemed ? '0 0 20px rgba(63, 185, 80, 0.1)' : '0 0 20px rgba(0, 229, 255, 0.1)',
                    position: 'relative'
                  }}>
                    <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.1em', color: 'var(--text-3)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Scan to Verify Entry</div>
                    
                    {/* QR Code Image */}
                    <div style={{
                      background: '#fff',
                      padding: '8px',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                      opacity: myToken.is_redeemed || myToken.isExpired ? 0.3 : 1,
                      transition: 'opacity 0.3s'
                    }}>
                      <img 
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=115x115&color=0e0e1c&data=${encodeURIComponent(JSON.stringify({
                          studentId: myToken.student_id,
                          tokenNumber: myToken.token_number,
                          token_for_date: myToken.token_for_date,
                          token_for_meal: myToken.token_for_meal
                        }))}`} 
                        alt="Meal Pass QR Code" 
                        style={{ width: '115px', height: '115px' }}
                      />
                    </div>

                    <div style={{ fontSize: '0.7rem', color: 'var(--text-2)', marginTop: '0.5rem', fontWeight: 600 }}>
                      {myToken.token_for_date}
                    </div>

                    {/* Overlay for Used / Expired */}
                    {myToken.is_redeemed && (
                      <div style={{
                        position: 'absolute',
                        background: 'rgba(63, 185, 80, 0.95)',
                        color: '#fff',
                        fontWeight: 900,
                        fontSize: '0.85rem',
                        padding: '4px 12px',
                        borderRadius: '4px',
                        border: '2px solid #fff',
                        transform: 'rotate(-10deg)',
                        boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
                        letterSpacing: '0.05em'
                      }}>
                        ACCESS GRANTED
                      </div>
                    )}
                    {!myToken.is_redeemed && myToken.isExpired && (
                      <div style={{
                        position: 'absolute',
                        background: 'rgba(255, 23, 68, 0.95)',
                        color: '#fff',
                        fontWeight: 900,
                        fontSize: '0.85rem',
                        padding: '4px 12px',
                        borderRadius: '4px',
                        border: '2px solid #fff',
                        transform: 'rotate(-10deg)',
                        boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
                        letterSpacing: '0.05em'
                      }}>
                        ACCESS DENIED
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            {selectedAbsenceMeal ? (
              <div className="meal-card animate-fade-in">
                <div style={{fontWeight:700,fontSize:'.85rem',marginBottom:'1rem',color:'var(--cyan)',display:'flex',alignItems:'center',gap:'6px'}}><CalendarDays size={16} /> Schedule Absence for Today</div>
                {/* Auto-show today's date */}
                <div style={{background:'rgba(0,229,255,0.06)',border:'1px solid rgba(0,229,255,0.2)',borderRadius:'8px',padding:'.6rem 1rem',marginBottom:'1rem',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{fontSize:'.72rem',color:'var(--text-3)',fontWeight:700,textTransform:'uppercase',letterSpacing:'.08em'}}>Today's Date</span>
                  <span style={{fontSize:'.9rem',fontFamily:'var(--font-mono)',fontWeight:700,color:'var(--cyan)'}}>{new Date().toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short',year:'numeric'})}</span>
                </div>
                <form onSubmit={submitAbsence}>
                  <div className="input-group">
                    <label className="input-label">Select Meal to Mark Absent (Choose One)</label>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'.6rem'}}>
                      <label style={{display:'flex',alignItems:'center',gap:'.5rem',background:returnMeal==='breakfast'?'rgba(0,229,255,0.1)':'rgba(255,255,255,0.03)',border:`1px solid ${returnMeal==='breakfast'?'var(--cyan)':'var(--border)'}`,borderRadius:'8px',padding:'.75rem',cursor:'pointer',transition:'all .2s'}}>
                        <input type="radio" name="mealChoice" value="breakfast" checked={returnMeal==='breakfast'} onChange={()=>setReturnMeal('breakfast')} style={{accentColor:'var(--cyan)'}}/>
                        <Sun size={16} style={{color:'var(--cyan)'}}/>
                        <span style={{fontSize:'.85rem',fontWeight:700,color:returnMeal==='breakfast'?'var(--cyan)':'var(--text-2)'}}>Breakfast</span>
                      </label>
                      <label style={{display:'flex',alignItems:'center',gap:'.5rem',background:returnMeal==='dinner'?'rgba(233,30,140,0.1)':'rgba(255,255,255,0.03)',border:`1px solid ${returnMeal==='dinner'?'var(--pink)':'var(--border)'}`,borderRadius:'8px',padding:'.75rem',cursor:'pointer',transition:'all .2s'}}>
                        <input type="radio" name="mealChoice" value="dinner" checked={returnMeal==='dinner'} onChange={()=>setReturnMeal('dinner')} style={{accentColor:'var(--pink)'}}/>
                        <Moon size={16} style={{color:'var(--pink)'}}/>
                        <span style={{fontSize:'.85rem',fontWeight:700,color:returnMeal==='dinner'?'var(--pink)':'var(--text-2)'}}>Dinner</span>
                      </label>
                    </div>
                  </div>
                  <button type="submit" className="btn btn-primary" style={{width:'100%',marginTop:'.5rem'}} disabled={absencesRemaining===0}>
                    {absencesRemaining===0?'Absence limit reached (8/8)':'Submit Absence'}
                  </button>
                  <button type="button" className="btn btn-secondary" style={{width:'100%',marginTop:'.5rem'}} onClick={() => setSelectedAbsenceMeal(null)}>
                    Cancel
                  </button>
                </form>
              </div>
            ) : (
              <>
                <MealCard meal="breakfast" icon={<Sun size={18} style={{ marginRight: '6px' }} />} />
                <MealCard meal="dinner"    icon={<Moon size={18} style={{ marginRight: '6px' }} />} />
              </>
            )}

          </>)}

          {tab==='leave' && (<>

            <div className="meal-card">
              <div style={{fontWeight:700,fontSize:'.85rem',marginBottom:'1rem',color:'var(--pink)',display:'flex',alignItems:'center',gap:'6px'}}><CalendarDays size={16} /> Apply for Long Leave</div>
              <form onSubmit={submitLeave}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'.75rem'}}>
                  <div className="input-group">
                    <label className="input-label">Start Date</label>
                    <input type="date" className="input-field" min={new Date().toISOString().split('T')[0]} value={leaveStart} onChange={e=>setLeaveStart(e.target.value)} required/>
                  </div>
                  <div className="input-group">
                    <label className="input-label">End Date</label>
                    <input type="date" className="input-field" min={leaveStart||new Date().toISOString().split('T')[0]} value={leaveEnd} onChange={e=>setLeaveEnd(e.target.value)} required/>
                  </div>
                </div>
                <div className="input-group">
                  <label className="input-label">Return Meal</label>
                  <select className="input-field" value={leaveReturnMeal} onChange={e=>setLeaveReturnMeal(e.target.value)}>
                    <option value="breakfast">Breakfast</option>
                    <option value="dinner">Dinner</option>
                  </select>
                </div>
                <button className="btn btn-pink" style={{width:'100%'}}>Apply for Long Leave</button>
              </form>
            </div>

            {leaves.length>0 && (
              <div className="meal-card">
                <div style={{fontWeight:700,fontSize:'.85rem',marginBottom:'.75rem',color:'var(--text-2)'}}>Leave History</div>
                {leaves.map(l=>(
                  <div key={l.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'.5rem 0',borderBottom:'1px solid var(--border)'}}>
                    <span style={{fontSize:'.8rem',color:'var(--text-2)'}}>{l.start_date} → {l.end_date}</span>
                    <span className={`badge ${l.status==='Approved'?'badge-active':l.status==='Rejected'?'badge-suspended':'badge-suspicious'}`}>{l.status}</span>
                  </div>
                ))}
              </div>
            )}
          </>)}

          {tab==='password' && (<>
            <div className="meal-card">
              <div style={{fontWeight:700,fontSize:'.85rem',marginBottom:'1rem',color:'var(--cyan)'}}>Change Password</div>
              <form onSubmit={changePassword}>
                <div className="input-group">
                  <label className="input-label">Current Password</label>
                  <div style={{ position: 'relative' }}>
                    <input type={showCurPass ? "text" : "password"} className="input-field" style={{ paddingRight: '2.5rem' }} value={cpCur} onChange={e=>setCpCur(e.target.value.substring(0, 12))} placeholder="Current Password" maxLength={12} required/>
                    <button 
                      type="button" 
                      onClick={() => setShowCurPass(!showCurPass)} 
                      style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    >
                      {showCurPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <div className="input-group">
                  <label className="input-label">New Password</label>
                  <div style={{ position: 'relative' }}>
                    <input type={showNewPass ? "text" : "password"} className="input-field" style={{ paddingRight: '2.5rem' }} value={cpNew} onChange={e=>setCpNew(e.target.value.substring(0, 12))} placeholder="New Password" maxLength={12} required/>
                    <button 
                      type="button" 
                      onClick={() => setShowNewPass(!showNewPass)} 
                      style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    >
                      {showNewPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <div className="input-group">
                  <label className="input-label">Confirm New Password</label>
                  <div style={{ position: 'relative' }}>
                    <input type={showConPass ? "text" : "password"} className="input-field" style={{ paddingRight: '2.5rem' }} value={cpCon} onChange={e=>setCpCon(e.target.value.substring(0, 12))} placeholder="Confirm New Password" maxLength={12} required/>
                    <button 
                      type="button" 
                      onClick={() => setShowConPass(!showConPass)} 
                      style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    >
                      {showConPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <button type="submit" className="btn btn-primary" style={{width:'100%',marginTop:'.5rem'}}>Update Password</button>
              </form>
            </div>

            <div className="meal-card" style={{ marginTop: '1.5rem', border: '1px solid var(--cyan)' }}>
              <div style={{fontWeight:700,fontSize:'.85rem',marginBottom:'.5rem',color:'var(--cyan)',display:'flex',alignItems:'center',gap:'6px'}}>
                <Fingerprint size={16} /> Biometric & Device Fingerprint
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-2)', marginBottom: '1rem' }}>
                Register this device to allow instant, secure login using your Fingerprint, FaceID, or Windows Hello.
              </p>
              <button 
                type="button"
                className="btn btn-secondary" 
                style={{ width: '100%', borderColor: 'var(--cyan)', color: 'var(--cyan)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                onClick={async () => {
                  try {
                    setError('');
                    setSuccess('');
                    
                    // 1. Get Registration Options
                    const optRes = await fetch(`${API_BASE}/auth/webauthn/register-options`, {
                      method: 'POST',
                      headers: hdrs(),
                      body: JSON.stringify({ userId: data.profile.id })
                    });
                    const options = await optRes.json();
                    if (!optRes.ok) throw new Error(options.error || 'Failed to get registration options');

                    // 2. Start native biometric prompt
                    let asseResp;
                    try {
                      asseResp = await startRegistration(options);
                    } catch (e) {
                      console.error("WebAuthn Error:", e);
                      throw new Error(`Biometric failed: ${e.message || e.name || 'Unknown error'}`);
                    }

                    // 3. Verify Registration
                    const verifyRes = await fetch(`${API_BASE}/auth/webauthn/register-verify`, {
                      method: 'POST',
                      headers: hdrs(),
                      body: JSON.stringify({ userId: data.profile.id, response: asseResp })
                    });
                    const verifyData = await verifyRes.json();
                    if (!verifyRes.ok) throw new Error(verifyData.error || 'Verification failed on server.');

                    setSuccess('Biometric login successfully registered for this device!');
                  } catch (err) {
                    setError(err.message);
                  }
                }}
              >
                <Fingerprint size={16} /> Register Biometric Login for this Device
              </button>
            </div>
          </>)}
        </div>
      </div>
    </div>
  );
};


const AdminDashboard = () => {
  const [tab, setTab] = useState('dashboard');
  const [rosterDate, setRosterDate] = useState(new Date().toISOString().split('T')[0]);
  const [roster, setRoster] = useState([]);
  const [verifiedB, setVerifiedB] = useState(0);
  const [verifiedD, setVerifiedD] = useState(0);
  const [votedPresentB, setVotedPresentB] = useState(0);
  const [votedPresentD, setVotedPresentD] = useState(0);
  const [metrics, setMetrics] = useState(null);
  const [leaves, setLeaves] = useState([]);
  const [suspicious, setSuspicious] = useState([]);
  const [students, setStudents] = useState([]);
  const [allowedEmails, setAllowedEmails] = useState([]);
  const [newEmail, setNewEmail] = useState('');
  const [newEmailNote, setNewEmailNote] = useState('');
  const [timeCfg, setTimeCfg] = useState({breakfast_start:'06:00',breakfast_end:'09:00',dinner_start:'18:00',dinner_end:'22:00'});
  const [tokens, setTokens] = useState([]);
  const [msg, setMsg] = useState({type:'',text:''});
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [reportMonth, setReportMonth] = useState(new Date().toISOString().slice(0, 7));
  const [showWhitelist, setShowWhitelist] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [importedFiles, setImportedFiles] = useState([]);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [currentlyVerifyingId, setCurrentlyVerifyingId] = useState(null);
  const [scanResultModal, setScanResultModal] = useState({ show: false, granted: false, reason: '', studentName: '', roomNumber: '', block: '', tokenNumber: '', meal: '', redeemedAt: '' });
  const [cameraActive, setCameraActive] = useState(false);
  const [html5QrScanner, setHtml5QrScanner] = useState(null);
  const navigate = useNavigate();

  const hmsToken = () => sessionStorage.getItem('hms_token');
  const ah = () => { const h={'Content-Type':'application/json'}; if(hmsToken()) h['Authorization']=`Bearer ${hmsToken()}`; return h; };
  const apiFetch = async (url, opts={}) => {
    const res = await fetch(url,{...opts,credentials:'include',headers:{...ah(),...(opts.headers||{})}});
    if(res.status===401||res.status===403){navigate('/login');throw new Error('Unauthorized');}
    const d=await res.json(); if(!res.ok) throw new Error(d.error||'Error'); return d;
  };
  const apiGet = url => apiFetch(url);
  const apiPost = (url,body) => apiFetch(url,{method:'POST',body:JSON.stringify(body)});
  const apiPatch = (url,body) => apiFetch(url,{method:'PATCH',body:JSON.stringify(body)});
  const apiPut = (url,body) => apiFetch(url,{method:'PUT',body:JSON.stringify(body)});
  const apiDel = url => apiFetch(url,{method:'DELETE'});
  const showMsg = (type,text) => { setMsg({type,text}); setTimeout(()=>setMsg({type:'',text:''}),4000); };

  const handleFileUpload = async (file) => {
    if (!file) return;
    setUploadLoading(true);
    setMsg({ type: '', text: '' });
    
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${API_BASE}/admin/allowed-emails/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${hmsToken()}`
        },
        body: formData,
        credentials: 'include'
      });

      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to upload whitelist file.');
      
      showMsg('success', d.message || `Successfully whitelisted ${d.count} new email(s).`);
      setShowWhitelist(true);
      loadAll();
    } catch (e) {
      showMsg('error', e.message);
    } finally {
      setUploadLoading(false);
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileUpload(e.target.files[0]);
    }
  };

  const loadRoster = async (date) => {
    try { 
      const d=await apiGet(`${API_BASE}/admin/attendance-roster?date=${date}`); 
      setRoster(d.roster); 
      setVerifiedB(d.verifiedBreakfast); 
      setVerifiedD(d.verifiedDinner); 
      setVotedPresentB(d.votedPresentBreakfast || 0); 
      setVotedPresentD(d.votedPresentDinner || 0); 
    } catch(e){showMsg('error',e.message);}
  };
  const loadAll = async () => {
    try {
      const [dm,dl,ds,de,dcfg,dtok,dimp] = await Promise.all([
        apiGet(`${API_BASE}/admin/dashboard`),
        apiGet(`${API_BASE}/admin/leave-requests`),
        apiGet(`${API_BASE}/admin/suspicious`),
        apiGet(`${API_BASE}/admin/allowed-emails`),
        apiGet(`${API_BASE}/admin/system-config`),
        apiGet(`${API_BASE}/admin/tokens?source_date=${rosterDate}&source_meal=dinner`),
        apiGet(`${API_BASE}/admin/allowed-emails/imports`)
      ]);
      setMetrics(dm.metrics); setLeaves(dl.requests); setSuspicious(ds.suspiciousAccounts);
      setAllowedEmails(de.emails);
      if(dcfg.config) setTimeCfg(c=>({...c,...dcfg.config}));
      setTokens(dtok.tokens||[]);
      setImportedFiles(dimp.imports || []);
    } catch(e){showMsg('error',e.message);}
  };

  // Debounced search for students
  useEffect(() => {
    const handler = setTimeout(() => {
      apiGet(`${API_BASE}/admin/students?status=${statusFilter}&search=${search}`)
        .then(res => setStudents(res.students))
        .catch(err => console.error(err));
    }, 300);
    return () => clearTimeout(handler);
  }, [search, statusFilter]);

  useEffect(()=>{ loadAll(); loadRoster(rosterDate); },[]);
  useEffect(()=>{ loadRoster(rosterDate); },[rosterDate]);

  useEffect(() => {
    let qrScanner = null;
    if (cameraActive) {
      const startCamera = async () => {
        try {
          qrScanner = new Html5Qrcode('qr-reader');
          setHtml5QrScanner(qrScanner);
          await qrScanner.start(
            { facingMode: 'environment' },
            {
              fps: 15,
              qrbox: { width: 250, height: 250 }
            },
            async (decodedText) => {
              if (qrScanner && qrScanner.getState && qrScanner.getState() === 2) {
                try { await qrScanner.stop(); } catch(e){ console.error(e); }
              }
              setCameraActive(false);
              await handleQrScan(decodedText);
            },
            () => {}
          );
        } catch (err) {
          console.error('Failed to start camera:', err);
          showMsg('error', 'Camera access failed or permission denied.');
          setCameraActive(false);
        }
      };
      
      const timer = setTimeout(startCamera, 300);
      return () => {
        clearTimeout(timer);
        if (qrScanner && qrScanner.getState && qrScanner.getState() === 2) {
          qrScanner.stop().catch(console.error);
        }
      };
    } else {
      if (html5QrScanner) {
        if (html5QrScanner.getState && html5QrScanner.getState() === 2) {
          html5QrScanner.stop().catch(console.error);
        }
        setHtml5QrScanner(null);
      }
    }
  }, [cameraActive]);

  const setToday = () => { const d=new Date().toISOString().split('T')[0]; setRosterDate(d); };
  const setTomorrow = () => { const d=new Date(Date.now()+86400000).toISOString().split('T')[0]; setRosterDate(d); };

  const verify = async (student_id, meal_type, currently) => {
    try { await apiPost(`${API_BASE}/admin/verify-attendance`,{student_id,date:rosterDate,meal_type,verify:!currently}); loadRoster(rosterDate); }
    catch(e){showMsg('error',e.message);}
  };

  const forceAbsent = async (student_id, meal_type) => {
    if (!window.confirm(`Force mark ${meal_type} absent for this student?`)) return;
    try {
      await apiPost(`${API_BASE}/admin/overwrite-vote`, { student_id, date: rosterDate, meal_type, status: 'Absent' });
      loadRoster(rosterDate);
      showMsg('success', 'Student marked as absent.');
    } catch(e) { showMsg('error', e.message); }
  };

  const deleteToken = async (id) => {
    if (!window.confirm("Are you sure you want to delete this token?")) return;
    try {
      await apiPost(`${API_BASE}/admin/tokens/delete`, { id });
      loadTokens();
      showMsg('success', 'Token deleted successfully.');
    } catch (e) {
      showMsg('error', e.message);
    }
  };

  const generateTokens = async (meal) => {
    try { const r=await apiPost(`${API_BASE}/admin/generate-tokens`,{source_date:rosterDate,source_meal:meal}); showMsg('success',r.message); loadAll(); loadRoster(rosterDate); }
    catch(e){showMsg('error',e.message);}
  };

  const updateTime = async () => {
    try { await apiPut(`${API_BASE}/admin/system-config`,timeCfg); showMsg('success','Time configuration updated.'); }
    catch(e){showMsg('error',e.message);}
  };

  const revokeAbsence = async (student_id, meal_type) => {
    try {
      await apiPost(`${API_BASE}/admin/revoke-absence`, { student_id, date: rosterDate, meal_type });
      showMsg('success', 'Absence revoked successfully. Student can now vote again.');
      loadRoster(rosterDate);
    } catch (e) {
      showMsg('error', e.message);
    }
  };

  const addEmail = async (e) => {
    e.preventDefault();
    try { 
      await apiPost(`${API_BASE}/admin/allowed-emails`,{email:newEmail,notes:newEmailNote}); 
      setNewEmail(''); 
      setNewEmailNote(''); 
      setShowWhitelist(true);
      loadAll(); 
      showMsg('success','Email added to whitelist.'); 
    }
    catch(er){showMsg('error',er.message);}
  };

  const removeEmail = async (idOrEmail) => {
    try { await apiDel(`${API_BASE}/admin/allowed-emails/${idOrEmail}`); loadAll(); showMsg('success','Email removed.'); }
    catch(e){showMsg('error',e.message);}
  };

  const deleteImportedBatch = async (filename) => {
    if (window.confirm(`Are you sure you want to remove all whitelisted emails imported from "${filename}"?`)) {
      try {
        const res = await apiPost(`${API_BASE}/admin/allowed-emails/bulk-delete`, { filename });
        loadAll();
        showMsg('success', res.message || 'Batch removed successfully.');
      } catch (e) {
        showMsg('error', e.message);
      }
    }
  };

  const bulkVerifyEmails = async () => {
    // Only verify non-verified allowedEmails
    const toVerify = allowedEmails.filter(e => !e.is_verified);
    if (toVerify.length === 0) {
      showMsg('success', 'All whitelisted emails are already verified.');
      return;
    }

    if (window.confirm(`Verify ${toVerify.length} pending whitelisted email(s) now? Structurally invalid Gmail addresses and emails on domains without valid MX records will be permanently removed to prevent fake slots.`)) {
      setVerifyLoading(true);
      setMsg({ type: '', text: '' });
      let checkedCount = 0;
      let removedCount = 0;
      
      try {
        for (const entry of toVerify) {
          setCurrentlyVerifyingId(entry.id || entry.email);
          // Show progress message
          setMsg({ 
            type: 'warning', 
            text: `Verifying email ${checkedCount + 1} of ${toVerify.length}: ${entry.email}...` 
          });
          
          const res = await apiPost(`${API_BASE}/admin/allowed-emails/verify-single`, { id: entry.id, email: entry.email });
          
          if (res.removed) {
            removedCount++;
            // Remove from the local state list immediately so the UI updates
            setAllowedEmails(prev => prev.filter(item => (item.id || item.email) !== (entry.id || entry.email)));
          } else if (res.verified) {
            // Update the local state list immediately to show the verified badge
            setAllowedEmails(prev => prev.map(item => (item.id || item.email) === (entry.id || entry.email) ? { ...item, is_verified: true } : item));
          }
          checkedCount++;
        }
        
        // Final loadAll to sync with any other database changes
        loadAll();
        
        if (removedCount > 0) {
          showMsg('warning', `Verification complete. Checked ${checkedCount} email(s) and removed ${removedCount} fake or invalid account(s).`);
        } else {
          showMsg('success', `Verification complete. Checked ${checkedCount} email(s) and all are valid.`);
        }
      } catch (e) {
        showMsg('error', e.message);
      } finally {
        setCurrentlyVerifyingId(null);
        setVerifyLoading(false);
      }
    }
  };

  const playBeep = (type) => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      if (type === 'success') {
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        osc.stop(ctx.currentTime + 0.15);
      } else {
        osc.frequency.setValueAtTime(220, ctx.currentTime);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.stop(ctx.currentTime + 0.3);
      }
    } catch (e) {
      console.error('Audio beep failed:', e);
    }
  };

  const handleQrScan = async (scannedString) => {
    let tokenData = null;
    try {
      tokenData = JSON.parse(scannedString.trim());
    } catch (e) {
      playBeep('error');
      setScanResultModal({
        show: true,
        granted: false,
        reason: 'Invalid pass code structure. Could not parse QR payload.'
      });
      return;
    }

    if (!tokenData || !tokenData.studentId || !tokenData.tokenNumber) {
      playBeep('error');
      setScanResultModal({
        show: true,
        granted: false,
        reason: 'No valid token pass data found in QR payload.'
      });
      return;
    }

    try {
      const res = await apiPost(`${API_BASE}/admin/tokens/verify-pass`, {
        tokenNumber: tokenData.tokenNumber,
        studentId: tokenData.studentId,
        token_for_date: tokenData.token_for_date,
        token_for_meal: tokenData.token_for_meal
      });

      if (res.success) {
        playBeep('success');
        setScanResultModal({
          show: true,
          granted: true,
          studentName: res.studentName,
          roomNumber: res.roomNumber,
          block: res.block,
          tokenNumber: res.tokenNumber,
          meal: res.meal
        });
        loadAll();
      } else {
        playBeep('error');
        setScanResultModal({
          show: true,
          granted: false,
          reason: res.reason || 'Verification failed.',
          studentName: res.studentName,
          redeemedAt: res.redeemedAt
        });
      }
    } catch (e) {
      playBeep('error');
      setScanResultModal({
        show: true,
        granted: false,
        reason: e.message || 'Pass check failed. Database connection error.'
      });
    }
  };


  const updateStatus = async (id, status) => {
    try { await apiPatch(`${API_BASE}/admin/student/${id}/status`,{status}); loadAll(); showMsg('success',`Status set to ${status}.`); }
    catch(e){showMsg('error',e.message);}
  };

  const deleteStudent = async (id, name) => {
    if (window.confirm(`WARNING: Are you sure you want to permanently delete student "${name}" from the database? This action is irreversible.`)) {
      try {
        await apiDel(`${API_BASE}/admin/student/${id}`);
        loadAll();
        showMsg('success', `Student "${name}" has been permanently deleted.`);
      } catch (e) {
        showMsg('error', e.message);
      }
    }
  };

  const leaveAction = async (id, action) => {
    try { await apiPost(`${API_BASE}/admin/leave-requests/${id}/action`,{action}); loadAll(); showMsg('success',`Leave ${action}d.`); }
    catch(e){showMsg('error',e.message);}
  };

  const suspAction = async (id, action) => {
    try { await apiPost(`${API_BASE}/admin/suspicious/${id}/action`,{action}); loadAll(); showMsg('success','Action done.'); }
    catch(e){showMsg('error',e.message);}
  };

  const logout = async () => { await fetch(`${API_BASE}/auth/logout`,{method:'POST',credentials:'include'}); sessionStorage.clear(); navigate('/login'); };

  const today = new Date().toLocaleDateString('en-GB').replace(/\//g,'/');

  const statusColor = s => ({Active:'var(--green)',Inactive:'var(--text-3)',Suspended:'var(--red)',Suspicious:'var(--orange)','Left Hostel':'var(--text-2)',Completed:'var(--pink)'}[s]||'var(--text-2)');

  const exportCSV = () => {
    if(!students.length) return;
    const rows = students.map(s=>[s.id,s.name,s.email,s.phone,s.room_number,s.block,s.join_year,s.status].join(','));
    const csv = 'ID,Name,Email,Phone,Room,Block,Year,Status\n'+rows.join('\n');
    const a=document.createElement('a'); a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv);
    a.download=`students_${rosterDate}.csv`; document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const downloadPDF = async (url, filename) => {
    try {
      const res = await fetch(url, {
        headers: ah(),
        credentials: 'include'
      });
      if (res.status === 401 || res.status === 403) {
        navigate('/login');
        return;
      }
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to download PDF.');
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showMsg('success', 'PDF downloaded successfully.');
    } catch (e) {
      showMsg('error', e.message);
    }
  };

  const downloadDailyPDF = (meal) => {
    downloadDailyPDFAsync(meal);
  };

  const downloadDailyPDFAsync = async (meal) => {
    await downloadPDF(`${API_BASE}/admin/report/daily?date=${rosterDate}&meal_type=${meal}`, `daily_roster_${meal}_${rosterDate}.pdf`);
  };

  const downloadMonthlyPDF = async () => {
    await downloadPDF(`${API_BASE}/admin/report/monthly?month=${reportMonth}`, `monthly_report_${reportMonth}.pdf`);
  };

  const activeResidents = students.filter(s => s.status === 'Active');
  const leftResidents = students.filter(s => s.status !== 'Active' && s.status !== 'Inactive');
  const pendingVerification = students.filter(s => s.status === 'Inactive');

  const getRosterSortWeight = (s) => {
    if (s.breakfast_vote === 'Present' || s.dinner_vote === 'Present') return 1;
    if (s.breakfast_vote === 'Absent' || s.dinner_vote === 'Absent') return 2;
    if (s.on_leave) return 3;
    return 4; // Not voted
  };

  const sortedRoster = [...roster].sort((a, b) => {
    const wA = getRosterSortWeight(a);
    const wB = getRosterSortWeight(b);
    if (wA !== wB) return wA - wB;
    return a.name.localeCompare(b.name);
  });

  // Roster count stats for display
  const rosterPresentB = roster.filter(r => r.breakfast_vote === 'Present').length;
  const rosterPresentD = roster.filter(r => r.dinner_vote === 'Present').length;
  const rosterAbsentB = roster.filter(r => r.breakfast_vote === 'Absent').length;
  const rosterAbsentD = roster.filter(r => r.dinner_vote === 'Absent').length;
  const rosterOnLeave = roster.filter(r => r.on_leave).length;
  const rosterNotVotedB = roster.filter(r => !r.on_leave && r.breakfast_vote === 'Not Voted').length;
  const rosterNotVotedD = roster.filter(r => !r.on_leave && r.dinner_vote === 'Not Voted').length;

  if(!metrics) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',flexDirection:'column',gap:'1rem'}}>
      <RefreshCw size={36} className="animate-spin text-cyan"/>
      <p className="text-muted" style={{fontSize:'.85rem'}}>Loading admin panel…</p>
    </div>
  );

  return (
    <div className="admin-layout">
      {/* Top Bar */}
      <div className="admin-topbar">
        <div className="admin-brand">
          <span className="admin-brand-icon" style={{ display: 'flex', alignItems: 'center' }}><User size={18} style={{ color: 'var(--cyan)' }} /></span>
          <div>
            <div className="admin-brand-title">ADMIN <span>CORE</span></div>
            <div className="admin-brand-sub"><span className="admin-brand-dot"/><span>MANAGEMENT CENTER | {today}</span></div>
          </div>
        </div>
        <button className="btn btn-secondary" onClick={logout} style={{fontSize:'.8rem'}}><LogOut size={14}/> SIGN OUT</button>
      </div>

      <div className="admin-content animate-fade-in">
        {msg.text && <div className={`alert alert-${msg.type==='error'?'error':'success'}`} style={{marginBottom:'1.25rem'}}><AlertTriangle size={14}/>{msg.text}</div>}

        {/* KPI */}
        <div className="kpi-grid">
          <div className="kpi-card"><div className="kpi-label" style={{color:'var(--cyan)'}}>Active Students</div><div className="kpi-value">{metrics.activeStudents}<span style={{fontSize:'1rem',color:'var(--text-3)',fontWeight:400}}> / {metrics.capacity}</span></div><div className="kpi-sub">Hostel capacity limit</div></div>
          <div className="kpi-card"><div className="kpi-label">Available Seats</div><div className="kpi-value" style={{color:'var(--green)'}}>{metrics.availableSeats}</div><div className="kpi-sub">Instantly updated</div></div>
          <div className="kpi-card"><div className="kpi-label">Left Hostel</div><div className="kpi-value" style={{color:'var(--text-2)'}}>{metrics.leftStudents}</div><div className="kpi-sub">Historical data preserved</div></div>
          <div className="kpi-card"><div className="kpi-label" style={{color:'var(--orange)'}}>Pending Requests</div><div className="kpi-value" style={{color:'var(--yellow)'}}>{leaves.filter(l=>l.status==='Pending').length}</div><div className="kpi-sub">Approve queue ↗</div></div>
        </div>

        {/* Tabs */}
        <div className="admin-tabs">
          {[
            ['dashboard','Dashboard'],
            ['directory','Directory'],
            ['leave','Leave Reqs']
          ].map(([k,l])=>(
            <button key={k} className={`admin-tab ${tab===k?'active':''}`} onClick={()=>setTab(k)}>{l}</button>
          ))}
        </div>

        {/* ——— DASHBOARD TAB ——— */}
        {tab==='dashboard' && (<>
          {/* Date Row */}
          <div className="date-row">
            <span className="date-display">{rosterDate}</span>
            <button className="date-btn active" onClick={setToday}>TODAY</button>
            <button className="date-btn" onClick={setTomorrow}>TOMORROW</button>
            <span className="date-row-sep"/>
            <div className="quick-btns">
              <button className="btn btn-cyan" style={{fontSize:'.75rem'}} onClick={()=>setTab('directory')}><Shield size={13}/> MANAGE DIRECTORY</button>
              <button className="btn btn-secondary" style={{fontSize:'.75rem',borderColor:'var(--orange)',color:'var(--orange)'}} onClick={()=>setTab('leave')}><Calendar size={13}/> LEAVE REQS</button>
            </div>
          </div>

          {/* Panels */}
          <div className="panels-grid">
            {/* Reporting */}
            <div className="panel-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: 0 }}><FileText size={16} /> REPORTING CENTER</div>
              
              {/* Daily Section */}
              <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-3)', marginBottom: '0.5rem', letterSpacing: '0.05em' }}>DAILY ROSTERS (DATE: {rosterDate})</div>
                <div className="report-dl-row" style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn btn-cyan" style={{flex:1,fontSize:'.75rem',padding:'0.5rem'}} onClick={() => downloadDailyPDF('breakfast')}><FileText size={12}/> BREAKFAST PDF</button>
                  <button className="btn btn-pink" style={{flex:1,fontSize:'.75rem',padding:'0.5rem'}} onClick={() => downloadDailyPDF('dinner')}><FileText size={12}/> DINNER PDF</button>
                </div>
              </div>

              {/* Monthly Section */}
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-3)', marginBottom: '0.5rem', letterSpacing: '0.05em' }}>MONTHLY SUMMARY</div>
                <div className="input-group" style={{ marginBottom: '0.5rem' }}>
                  <input type="month" className="input-field" value={reportMonth} onChange={e => setReportMonth(e.target.value)} style={{ padding: '0.4rem 0.6rem', fontSize: '0.8rem' }}/>
                </div>
                <button className="btn btn-primary" style={{ width: '100%', fontSize: '0.75rem', padding: '0.5rem' }} onClick={downloadMonthlyPDF}>
                  <FileSpreadsheet size={12}/> GENERATE MONTHLY REPORT
                </button>
              </div>
            </div>

            {/* Time Config */}
            <div className="panel-card">
              <div className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Clock size={16} /> TIME CONFIG</div>
              <div className="time-grid">
                {[['breakfast_start','B-START'],['breakfast_end','B-END'],['dinner_start','D-START'],['dinner_end','D-END']].map(([k,l])=>(
                  <div key={k} className="time-input-wrap">
                    <span className="time-input-label">{l}</span>
                    <input type="time" className="input-field" style={{padding:'.5rem .6rem',fontSize:'.85rem'}} value={timeCfg[k]||''} onChange={e=>setTimeCfg(c=>({...c,[k]:e.target.value}))}/>
                  </div>
                ))}
              </div>
              <button className="btn btn-primary" style={{width:'100%',marginTop:'.5rem',fontSize:'.82rem'}} onClick={updateTime}>UPDATE SYSTEM TIMES</button>
            </div>
          </div>

          {/* Token Generation Control Panel */}
          <div className="panel-card" style={{ marginBottom: '1.75rem', border: '1px solid rgba(0, 229, 255, 0.25)' }}>
            <div className="panel-title" style={{ color: 'var(--cyan)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Award size={16} /> JSS HOSTEL TOKEN GENERATION CENTER
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              <div>
                <h4 style={{ fontSize: '0.9rem', marginBottom: '0.5rem', color: 'var(--text)' }}>Roster Verification Status</h4>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-2)', marginBottom: '0.75rem' }}>
                  Generate Sunday Breakfast tokens for residents physically verified during Saturday Dinner.
                </p>
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                  <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.75rem', flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-3)' }}>DINNER VERIFIED</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--pink)' }}>{verifiedD}</div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.75rem', flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-3)' }}>TOKENS GENERATED</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--cyan)' }}>{tokens.length}</div>
                  </div>
                </div>
                <button 
                  className="btn btn-cyan" 
                  style={{ width: '100%', padding: '0.85rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  onClick={() => generateTokens('dinner')} 
                  disabled={verifiedD === 0}
                >
                  <Award size={16} /> Generate JSS Hostel Tokens
                </button>
              </div>
              
              <div>
                <h4 style={{ fontSize: '0.9rem', marginBottom: '0.5rem', color: 'var(--text)' }}>Active Roster Tokens</h4>
                <div style={{ maxHeight: '145px', overflowY: 'auto', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.5rem' }}>
                  {tokens.length === 0 ? (
                    <p style={{ color: 'var(--text-3)', fontSize: '0.75rem', textAlign: 'center', padding: '2rem 0' }}>
                      No tokens generated yet. Click "Generate JSS Hostel Tokens" after verifying Saturday dinner attendance.
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      {tokens.map(t => (
                        <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', padding: '0.4rem 0.6rem', borderRadius: '6px' }}>
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-2)', fontWeight: 600 }}>{t.Student?.name || t.student_id}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--cyan)', fontWeight: 800 }}>
                              JSS Token #{t.token_number}
                            </span>
                            <button 
                              onClick={() => deleteToken(t.id)} 
                              style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.8 }}
                              title="Remove Token"
                              onMouseEnter={e => e.currentTarget.style.opacity = 1}
                              onMouseLeave={e => e.currentTarget.style.opacity = 0.8}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>          {/* Meal Entry Pass Scanner Simulator */}
          <div className="panel-card" style={{ marginBottom: '1.75rem', border: '1px solid rgba(0, 229, 255, 0.25)', position: 'relative' }}>
            <style>{`
              @keyframes scanLine {
                0% { top: 0%; }
                50% { top: 100%; }
                100% { top: 0%; }
              }
            `}</style>
            
            <div className="panel-title" style={{ color: 'var(--cyan)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Shield size={16} /> ADMIN MEAL ENTRY PASS SECURE SCANNER
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', background: 'rgba(0, 229, 255, 0.1)', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(0, 229, 255, 0.2)' }}>
                Originality Verified
              </div>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '1rem 0' }}>
              <div style={{ textAlign: 'center', maxWidth: '480px', marginBottom: '0.5rem' }}>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-2)' }}>
                  Admin scanning console. Click below to activate your camera and scan the student's meal pass QR code (from their dashboard) to verify entry.
                </p>
              </div>
              
              <div style={{ display: cameraActive ? 'flex' : 'none', width: '100%', flexDirection: 'column', alignItems: 'center', gap: '1.25rem' }}>
                <div 
                  id="qr-reader" 
                  style={{ 
                    width: '100%', 
                    maxWidth: '340px', 
                    aspectRatio: '1', 
                    borderRadius: '12px', 
                    overflow: 'hidden', 
                    border: '2px solid var(--cyan)',
                    boxShadow: '0 0 25px rgba(0, 229, 255, 0.3)',
                    position: 'relative'
                  }}
                >
                  <div style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0,
                    height: '2.5px',
                    background: 'var(--cyan)',
                    boxShadow: '0 0 12px var(--cyan)',
                    animation: 'scanLine 2.5s linear infinite',
                    zIndex: 1
                  }} />
                </div>
                
                <button 
                  className="btn btn-secondary" 
                  style={{ padding: '0.75rem 2rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '8px', borderColor: 'var(--red)', color: 'var(--red)' }}
                  onClick={() => setCameraActive(false)}
                >
                  <CameraOff size={16} /> Deactivate Scanner Camera
                </button>
              </div>

              <div 
                style={{ 
                  display: !cameraActive ? 'flex' : 'none',
                  width: '100%', 
                  maxWidth: '340px', 
                  aspectRatio: '1.3', 
                  background: 'rgba(255,255,255,0.01)', 
                  border: '1.5px dashed rgba(0, 229, 255, 0.35)', 
                  borderRadius: '16px', 
                  flexDirection: 'column', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  gap: '1rem',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  boxShadow: 'inset 0 0 15px rgba(0, 229, 255, 0.02)'
                }}
                onClick={() => setCameraActive(true)}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--cyan)';
                  e.currentTarget.style.boxShadow = 'inset 0 0 25px rgba(0, 229, 255, 0.05), 0 0 15px rgba(0, 229, 255, 0.1)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'rgba(0, 229, 255, 0.35)';
                  e.currentTarget.style.boxShadow = 'inset 0 0 15px rgba(0, 229, 255, 0.02)';
                }}
              >
                <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(0, 229, 255, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--cyan)' }}>
                  <Camera size={26} />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <span style={{ fontSize: '0.88rem', color: 'var(--cyan)', fontWeight: 800, display: 'block', marginBottom: '2px' }}>Start Camera Scanner</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Scan resident QR code passes</span>
                </div>
              </div>
            </div>
          </div>

            {/* SCAN RESULT MODAL OVERLAY (ACCESS GRANTED / ACCESS DENIED) */}
            {scanResultModal.show && (
              <div style={{
                position: 'absolute',
                top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(10, 10, 24, 0.96)',
                backdropFilter: 'blur(8px)',
                borderRadius: '12px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10,
                animation: 'fadeIn 0.25s ease',
                padding: '1.5rem',
                textAlign: 'center',
                border: scanResultModal.granted ? '2px solid var(--green)' : '2px solid var(--red)'
              }}>
                {scanResultModal.granted ? (
                  <>
                    <div style={{
                      width: '64px', height: '64px',
                      borderRadius: '50%',
                      background: 'rgba(63, 185, 80, 0.1)',
                      border: '3px solid var(--green)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--green)',
                      marginBottom: '1rem',
                      boxShadow: '0 0 20px rgba(63, 185, 80, 0.3)'
                    }}>
                      <CheckCircle size={32} />
                    </div>
                    <h2 style={{ color: 'var(--green)', fontWeight: 900, fontSize: '1.8rem', letterSpacing: '0.05em', marginBottom: '0.5rem', textTransform: 'uppercase', textShadow: '0 0 10px rgba(63, 185, 80, 0.4)' }}>
                      ACCESS GRANTED
                    </h2>
                    <p style={{ fontSize: '0.9rem', color: '#fff', fontWeight: 700, marginBottom: '1.5rem' }}>
                      Verified Resident: <span style={{ color: 'var(--cyan)' }}>{scanResultModal.studentName}</span>
                    </p>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', maxWidth: '280px', width: '100%', marginBottom: '1.5rem' }}>
                      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.4rem 0.6rem' }}>
                        <div style={{ fontSize: '0.58rem', color: 'var(--text-3)' }}>ROOM / BLOCK</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-2)', fontWeight: 800 }}>{scanResultModal.roomNumber} ({scanResultModal.block})</div>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.4rem 0.6rem' }}>
                        <div style={{ fontSize: '0.58rem', color: 'var(--text-3)' }}>TOKEN / MEAL</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-2)', fontWeight: 800 }}>#{scanResultModal.tokenNumber} - {scanResultModal.meal?.toUpperCase()}</div>
                      </div>
                    </div>
                    
                    <button 
                      className="btn btn-cyan" 
                      style={{ padding: '0.5rem 2rem', fontWeight: 800, fontSize: '0.8rem' }}
                      onClick={() => setScanResultModal(prev => ({ ...prev, show: false }))}
                    >
                      Clear & Continue
                    </button>
                  </>
                ) : (
                  <>
                    <div style={{
                      width: '64px', height: '64px',
                      borderRadius: '50%',
                      background: 'rgba(255, 23, 68, 0.1)',
                      border: '3px solid var(--red)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--red)',
                      marginBottom: '1rem',
                      boxShadow: '0 0 20px rgba(255, 23, 68, 0.3)'
                    }}>
                      <XCircle size={32} />
                    </div>
                    <h2 style={{ color: 'var(--red)', fontWeight: 900, fontSize: '1.8rem', letterSpacing: '0.05em', marginBottom: '0.5rem', textTransform: 'uppercase', textShadow: '0 0 10px rgba(255, 23, 68, 0.4)' }}>
                      ACCESS DENIED
                    </h2>
                    <p style={{ fontSize: '0.9rem', color: 'var(--red)', fontWeight: 800, marginBottom: '0.5rem' }}>
                      {scanResultModal.reason}
                    </p>
                    {scanResultModal.studentName && (
                      <p style={{ fontSize: '0.78rem', color: 'var(--text-2)', marginBottom: '1.5rem' }}>
                        Registered to: <strong style={{ color: 'var(--text-primary)' }}>{scanResultModal.studentName}</strong>
                        {scanResultModal.redeemedAt && <span> (Used at: {scanResultModal.redeemedAt})</span>}
                      </p>
                    )}
                    
                    <button 
                      className="btn btn-secondary" 
                      style={{ padding: '0.5rem 2rem', fontWeight: 800, fontSize: '0.8rem', borderColor: 'var(--red)', color: 'var(--red)', marginTop: scanResultModal.studentName ? 0 : '1rem' }}
                      onClick={() => setScanResultModal(prev => ({ ...prev, show: false }))}
                    >
                      Close Alert
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Live Attendance Roster */}
          <div className="roster-card">
            <div className="roster-head">
              <div>
                <div className="roster-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><ShieldAlert size={16} /> LIVE ATTENDANCE ROSTER</div>
                <div className="roster-sub">MONITORING | ACTIVE STUDENTS | {rosterDate}</div>
              </div>
              <button className="btn btn-secondary" style={{fontSize:'.75rem'}} onClick={()=>loadRoster(rosterDate)}><RefreshCw size={12}/></button>
            </div>

            {/* Prominent Vote Count Dashboard */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:0,borderBottom:'1px solid var(--border)'}}>
              <div style={{padding:'1.25rem 1.5rem',borderRight:'1px solid var(--border)',textAlign:'center'}}>
                <div style={{fontSize:'.62rem',fontWeight:800,color:'var(--green)',textTransform:'uppercase',letterSpacing:'.1em',marginBottom:'.35rem'}}>✓ VOTED PRESENT</div>
                <div style={{fontSize:'2rem',fontWeight:900,fontFamily:'var(--font-mono)',color:'var(--green)',lineHeight:1}}>B:{rosterPresentB}</div>
                <div style={{fontSize:'1.3rem',fontWeight:900,fontFamily:'var(--font-mono)',color:'var(--green)',lineHeight:1,marginTop:'.2rem'}}>D:{rosterPresentD}</div>
              </div>
              <div style={{padding:'1.25rem 1.5rem',borderRight:'1px solid var(--border)',textAlign:'center'}}>
                <div style={{fontSize:'.62rem',fontWeight:800,color:'var(--red)',textTransform:'uppercase',letterSpacing:'.1em',marginBottom:'.35rem'}}>✗ VOTED ABSENT</div>
                <div style={{fontSize:'2rem',fontWeight:900,fontFamily:'var(--font-mono)',color:'var(--red)',lineHeight:1}}>B:{rosterAbsentB}</div>
                <div style={{fontSize:'1.3rem',fontWeight:900,fontFamily:'var(--font-mono)',color:'var(--red)',lineHeight:1,marginTop:'.2rem'}}>D:{rosterAbsentD}</div>
              </div>
              <div style={{padding:'1.25rem 1.5rem',borderRight:'1px solid var(--border)',textAlign:'center'}}>
                <div style={{fontSize:'.62rem',fontWeight:800,color:'var(--yellow)',textTransform:'uppercase',letterSpacing:'.1em',marginBottom:'.35rem'}}>◷ ON LONG LEAVE</div>
                <div style={{fontSize:'2rem',fontWeight:900,fontFamily:'var(--font-mono)',color:'var(--yellow)',lineHeight:1}}>{rosterOnLeave}</div>
                <div style={{fontSize:'.7rem',color:'var(--text-3)',marginTop:'.4rem'}}>students away</div>
              </div>
              <div style={{padding:'1.25rem 1.5rem',textAlign:'center'}}>
                <div style={{fontSize:'.62rem',fontWeight:800,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'.1em',marginBottom:'.35rem'}}>⊘ NOT VOTED</div>
                <div style={{fontSize:'2rem',fontWeight:900,fontFamily:'var(--font-mono)',color:'var(--text-3)',lineHeight:1}}>B:{rosterNotVotedB}</div>
                <div style={{fontSize:'1.3rem',fontWeight:900,fontFamily:'var(--font-mono)',color:'var(--text-3)',lineHeight:1,marginTop:'.2rem'}}>D:{rosterNotVotedD}</div>
              </div>
            </div>

            {/* Verified Count Banner */}
            <div style={{display:'flex',gap:'1rem',padding:'.75rem 1.5rem',background:'rgba(233,30,140,0.04)',borderBottom:'1px solid var(--border)',flexWrap:'wrap'}}>
              <div className="roster-badge pink" style={{fontWeight:800}}><CheckCircle size={12}/> PHYSICALLY VERIFIED — B: {verifiedB} | D: {verifiedD}</div>
              <div style={{fontSize:'.72rem',color:'var(--text-3)',alignSelf:'center'}}>Only Present-voted students can be verified below</div>
            </div>

            <div className="cyber-table-wrap">
              <table className="cyber-table">
                <thead>
                  <tr>
                    <th>STUDENT PROFILE</th>
                    <th>BREAKFAST STATUS</th>
                    <th>DINNER STATUS</th>
                    <th>SUNDAY ACCESS</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRoster.length===0 ? (
                    <tr><td colSpan={4} style={{textAlign:'center',color:'var(--text-3)',padding:'2rem'}}>No active students found.</td></tr>
                  ) : sortedRoster.map(s=>(
                    <tr key={s.id}>
                      <td>
                        <div style={{fontWeight:700,fontSize:'.875rem', display:'flex', alignItems:'center', gap:'8px'}}>
                          {s.name}
                          {s.on_leave && <span style={{fontSize:'0.65rem', background:'rgba(255,214,0,0.12)', color:'var(--yellow)', border:'1px solid rgba(255,214,0,0.35)', padding:'1px 6px', borderRadius:'4px', fontWeight:800}}>◷ ON LEAVE</span>}
                        </div>
                        <div style={{fontSize:'.72rem',color:'var(--text-3)',fontFamily:'var(--font-mono)'}}>{s.id} • ROOM {s.room_number}</div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                          <div style={{display:'flex',alignItems:'center',gap:'.4rem',fontSize:'.78rem',fontWeight:700,
                            color: s.on_leave ? 'var(--yellow)' : s.breakfast_vote==='Present' ? 'var(--green)' : s.breakfast_vote==='Absent' ? 'var(--red)' : 'var(--text-3)'}}>
                            {s.on_leave ? '◷' : s.breakfast_vote==='Present' ? '✓' : s.breakfast_vote==='Absent' ? '✗' : '⊘'}
                            {' '}{s.on_leave ? 'ON LEAVE' : s.breakfast_vote.toUpperCase()}
                            {s.breakfast_vote === 'Absent' && !s.on_leave && (
                              <button 
                                onClick={() => revokeAbsence(s.id, 'breakfast')}
                                title="Revoke absence and allow student to vote again"
                                style={{
                                  background: 'rgba(255, 23, 68, 0.1)',
                                  border: '1px solid rgba(255, 23, 68, 0.3)',
                                  color: 'var(--red)',
                                  fontSize: '0.62rem',
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  marginLeft: '8px',
                                  fontWeight: 800
                                }}
                              >
                                REVOKE
                              </button>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button 
                              className={`verify-btn ${s.breakfast_verified?'verified':'unverified'}`} 
                              onClick={()=>verify(s.id,'breakfast',s.breakfast_verified)} 
                              style={{ 
                                width: 'fit-content', 
                                fontSize: '0.65rem', 
                                opacity: s.breakfast_vote !== 'Present' ? 0.3 : 1, 
                                cursor: s.breakfast_vote !== 'Present' ? 'not-allowed' : 'pointer' 
                              }}
                              disabled={s.breakfast_vote !== 'Present'}
                            >
                              {s.breakfast_verified?'✓ VERIFIED':'VERIFY'}
                            </button>
                            {s.breakfast_vote === 'Present' && (
                              <button
                                onClick={() => forceAbsent(s.id, 'breakfast')}
                                style={{
                                  background: 'rgba(255, 23, 68, 0.1)',
                                  border: '1px solid rgba(255, 23, 68, 0.3)',
                                  color: 'var(--red)',
                                  fontSize: '0.65rem',
                                  padding: '2px 8px',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontWeight: 800
                                }}
                                title="Force mark student as absent"
                              >
                                MARK ABSENT
                              </button>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                          <div style={{display:'flex',alignItems:'center',gap:'.4rem',fontSize:'.78rem',fontWeight:700,
                            color: s.on_leave ? 'var(--yellow)' : s.dinner_vote==='Present' ? 'var(--green)' : s.dinner_vote==='Absent' ? 'var(--red)' : 'var(--text-3)'}}>
                            {s.on_leave ? '◷' : s.dinner_vote==='Present' ? '✓' : s.dinner_vote==='Absent' ? '✗' : '⊘'}
                            {' '}{s.on_leave ? 'ON LEAVE' : s.dinner_vote.toUpperCase()}
                            {s.dinner_vote === 'Absent' && !s.on_leave && (
                              <button 
                                onClick={() => revokeAbsence(s.id, 'dinner')}
                                title="Revoke absence and allow student to vote again"
                                style={{
                                  background: 'rgba(255, 23, 68, 0.1)',
                                  border: '1px solid rgba(255, 23, 68, 0.3)',
                                  color: 'var(--red)',
                                  fontSize: '0.62rem',
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  marginLeft: '8px',
                                  fontWeight: 800
                                }}
                              >
                                REVOKE
                              </button>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button 
                              className={`verify-btn ${s.dinner_verified?'verified':'unverified'}`} 
                              onClick={()=>verify(s.id,'dinner',s.dinner_verified)} 
                              style={{ 
                                width: 'fit-content', 
                                fontSize: '0.65rem', 
                                opacity: s.dinner_vote !== 'Present' ? 0.3 : 1, 
                                cursor: s.dinner_vote !== 'Present' ? 'not-allowed' : 'pointer' 
                              }}
                              disabled={s.dinner_vote !== 'Present'}
                            >
                              {s.dinner_verified?'✓ VERIFIED':'VERIFY'}
                            </button>
                            {s.dinner_vote === 'Present' && (
                              <button
                                onClick={() => forceAbsent(s.id, 'dinner')}
                                style={{
                                  background: 'rgba(255, 23, 68, 0.1)',
                                  border: '1px solid rgba(255, 23, 68, 0.3)',
                                  color: 'var(--red)',
                                  fontSize: '0.65rem',
                                  padding: '2px 8px',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontWeight: 800
                                }}
                                title="Force mark student as absent"
                              >
                                MARK ABSENT
                              </button>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        {s.token ? (
                          <span className="token-badge-roster">#{s.token.number} JSS Token</span>
                        ) : (
                          <span className="no-token-badge">NO TOKEN</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>)}

        {/* ——— DIRECTORY TAB ——— */}
        {tab==='directory' && (<>
          {/* Email Whitelist */}
          <div className="panel-card" style={{marginBottom:'1.5rem'}}>
            <div className="panel-title">EMAIL WHITELIST — Permitted Registrations</div>
            <form onSubmit={addEmail} style={{display:'flex',gap:'.75rem',marginBottom:'1.25rem',flexWrap:'wrap'}}>
              <input className="input-field" style={{flex:2,minWidth:'200px'}} placeholder="student@example.com" value={newEmail} onChange={e=>setNewEmail(e.target.value)} type="email" required/>
              <input className="input-field" style={{flex:1,minWidth:'140px'}} placeholder="Notes (optional)" value={newEmailNote} onChange={e=>setNewEmailNote(e.target.value)}/>
              <button className="btn btn-cyan" style={{fontSize:'.82rem'}}>+ Add Email</button>
            </form>

            <div style={{ marginBottom: '1.25rem' }}>

            </div>

            {/* Bulk Whitelist Upload Dropzone */}
            <div 
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              style={{
                border: dragActive ? '2px dashed var(--cyan)' : '2px dashed var(--border)',
                background: dragActive ? 'rgba(0, 229, 255, 0.05)' : 'rgba(255, 255, 255, 0.01)',
                borderRadius: '12px',
                padding: '1.5rem',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.25s ease',
                marginBottom: '1.25rem',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem'
              }}
              onClick={() => document.getElementById('bulk-file-input').click()}
            >
              <input 
                id="bulk-file-input"
                type="file" 
                accept=".xlsx,.xls,.csv,.txt,.pdf"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
              {uploadLoading ? (
                <>
                  <RefreshCw size={24} className="animate-spin text-cyan" />
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>Processing document & extracting emails...</span>
                </>
              ) : (
                <>
                  <Upload size={24} style={{ color: 'var(--cyan)', opacity: dragActive ? 1 : 0.7 }} />
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-2)', fontWeight: 600 }}>
                    {dragActive ? 'Drop your file here!' : 'Drag & drop Excel, CSV, Text or PDF file'}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>
                    or click to browse your files
                  </span>
                </>
              )}
            </div>

            {/* Bulk Imported Files Batches */}
            {importedFiles.length > 0 && (
              <div style={{ marginBottom: '1.25rem' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-3)', fontWeight: 700, display: 'block', marginBottom: '0.5rem', letterSpacing: '0.05em' }}>
                  IMPORTED BATCHES (REMOVE BATCH BY SELECTING FILENAME OR CLICKING REMOVE BATCH)
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {importedFiles.map(file => (
                    <div 
                      key={file.filename} 
                      style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        background: 'rgba(255, 255, 255, 0.02)', 
                        border: '1px solid var(--border)', 
                        padding: '0.5rem 0.75rem', 
                        borderRadius: '8px' 
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FileText size={14} style={{ color: 'var(--cyan)' }} />
                        <span 
                          onClick={() => deleteImportedBatch(file.filename)}
                          style={{ 
                            fontSize: '0.85rem', 
                            color: 'var(--text-primary)', 
                            fontWeight: 600,
                            cursor: 'pointer',
                            textDecoration: 'underline decoration-dotted',
                            transition: 'color 0.2s'
                          }}
                          onMouseEnter={e => e.target.style.color = 'var(--cyan)'}
                          onMouseLeave={e => e.target.style.color = 'var(--text-primary)'}
                          title="Click to remove this batch"
                        >
                          {file.filename}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>
                          ({file.count} emails)
                        </span>
                      </div>
                      <button 
                        type="button"
                        className="verify-btn" 
                        style={{ 
                          background: 'rgba(255, 23, 68, 0.1)', 
                          color: 'var(--red)', 
                          border: '1px solid rgba(255, 23, 68, 0.3)',
                          cursor: 'pointer'
                        }} 
                        onClick={() => deleteImportedBatch(file.filename)}
                      >
                        Remove Batch
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Toggle show/hide whitelist list */}
            <div style={{ marginTop: '1rem' }}>
              {showWhitelist ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-3)', fontWeight: 700 }}>WHITELISTED EMAILS ({allowedEmails.length})</span>
                    <button 
                      type="button" 
                      onClick={() => setShowWhitelist(false)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--cyan)',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      Hide Whitelist
                    </button>
                  </div>
                  <div className="email-list">
                    {allowedEmails.length===0 ? <p style={{color:'var(--text-3)',fontSize:'.85rem'}}>No emails in whitelist. Add emails above or upload a file.</p>
                    : allowedEmails.map(e=>(
                      <div 
                        key={e.id || e.email} 
                        className="email-entry"
                        style={{
                          transition: 'all 0.3s ease',
                          borderLeft: (e.id || e.email) === currentlyVerifyingId ? '4px solid var(--cyan)' : undefined,
                          background: (e.id || e.email) === currentlyVerifyingId ? 'rgba(0, 229, 255, 0.05)' : undefined
                        }}
                      >
                        <div>
                          <span className="email-entry-text">{e.email}</span>

                          {e.notes && <span style={{fontSize:'.72rem',color:'var(--text-3)',marginLeft:'.5rem'}}>— {e.notes}</span>}
                        </div>
                        <button className="verify-btn" style={{background:'var(--red-dim)',color:'var(--red)',border:'1px solid rgba(255,23,68,.3)'}} onClick={()=>removeEmail(e.id || e.email)}>Remove</button>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  style={{ fontSize: '0.82rem', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  onClick={() => setShowWhitelist(true)}
                >
                  Show Whitelisted Emails ({allowedEmails.length})
                </button>
              )}
            </div>
          </div>

          {/* Student Directory - Active Residents Only */}
          <div className="panel-card" style={{marginBottom:'1.5rem', border: '1px solid rgba(0, 229, 255, 0.25)'}}>
            <div className="panel-title" style={{color:'var(--cyan)'}}>ACTIVE RESIDENTS DIRECTORY</div>
            <div style={{display:'flex',gap:'.75rem',marginBottom:'1rem',flexWrap:'wrap'}}>
              <input className="input-field" style={{flex:1,minWidth:'180px'}} placeholder="Search active name..." value={search} onChange={e=>{setSearch(e.target.value);}}/>
              <select className="input-field" style={{width:'160px'}} value={statusFilter} onChange={e=>{setStatusFilter(e.target.value);}}>
                <option value="">All Statuses</option>
                {['Active','Inactive','Suspended','Left Hostel','Suspicious','Completed'].map(s=><option key={s} value={s}>{s}</option>)}
              </select>
              <button className="btn btn-secondary" style={{fontSize:'.78rem'}} onClick={exportCSV}>Export CSV</button>
            </div>
            <div className="cyber-table-wrap">
              <table className="cyber-table">
                <thead><tr><th>ID</th><th>Name</th><th>Room</th><th>Block</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {activeResidents.length===0 ? (
                    <tr><td colSpan={6} style={{textAlign:'center',color:'var(--text-3)',padding:'2rem'}}>No active students found.</td></tr>
                  ) : activeResidents.map(s=>(
                    <tr key={s.id}>
                      <td style={{fontFamily:'var(--font-mono)',fontSize:'.8rem'}}>{s.id}</td>
                      <td style={{fontWeight:600}}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>{s.name}</span>
                          {s.status === 'Active' && (
                            <span 
                              title="Verified email and active profile" 
                              style={{ 
                                fontSize: '0.62rem', 
                                color: 'var(--green)', 
                                background: 'rgba(63, 185, 80, 0.1)', 
                                border: '1px solid rgba(63, 185, 80, 0.2)', 
                                padding: '1px 4px', 
                                borderRadius: '4px',
                                display: 'inline-flex',
                                alignItems: 'center'
                              }}
                            >
                              ✓ VERIFIED
                            </span>
                          )}
                        </div>
                      </td>
                      <td>{s.room_number}</td>
                      <td>{s.block}</td>
                      <td><span style={{color:statusColor(s.status),fontWeight:700,fontSize:'.8rem'}}>{s.status}</span></td>
                      <td>
                        <div style={{display:'flex',gap:'.4rem',flexWrap:'wrap'}}>
                          <button className="verify-btn" style={{background:'var(--red-dim)',color:'var(--red)',border:'1px solid rgba(255,23,68,.3)'}} onClick={()=>updateStatus(s.id,'Suspended')}>Suspend</button>
                          <button className="verify-btn unverified" onClick={()=>updateStatus(s.id,'Left Hostel')}>Left</button>
                          <button className="verify-btn" style={{background:'rgba(255,23,68,0.1)',color:'#ff1744',border:'1px solid rgba(255,23,68,0.4)',fontWeight:700}} onClick={()=>deleteStudent(s.id, s.name)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pending Email Verification Panel */}
          <div className="panel-card" style={{marginBottom:'1.5rem', border: '1px solid rgba(255, 152, 0, 0.25)'}}>
            <div className="panel-title" style={{color:'var(--orange)'}}>PENDING EMAIL VERIFICATION (UNVERIFIED REGISTRATIONS)</div>
            <div className="cyber-table-wrap">
              <table className="cyber-table">
                <thead><tr><th>ID</th><th>Name</th><th>Room</th><th>Block</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {pendingVerification.length===0 ? (
                    <tr><td colSpan={6} style={{textAlign:'center',color:'var(--text-3)',padding:'2rem'}}>No unverified registrations found.</td></tr>
                  ) : pendingVerification.map(s=>(
                    <tr key={s.id}>
                      <td style={{fontFamily:'var(--font-mono)',fontSize:'.8rem'}}>{s.id}</td>
                      <td style={{fontWeight:600}}>{s.name}</td>
                      <td>{s.room_number}</td>
                      <td>{s.block}</td>
                      <td><span style={{color:statusColor(s.status),fontWeight:700,fontSize:'.8rem'}}>{s.status}</span></td>
                      <td>
                        <div style={{display:'flex',gap:'.4rem',flexWrap:'wrap'}}>
                          <button className="verify-btn unverified" onClick={()=>updateStatus(s.id,'Active')}>Activate (Verify Manually)</button>
                          <button className="verify-btn" style={{background:'rgba(255,23,68,0.1)',color:'#ff1744',border:'1px solid rgba(255,23,68,0.4)',fontWeight:700}} onClick={()=>deleteStudent(s.id, s.name)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Left Students Panel */}
          <div className="panel-card" style={{marginBottom:'1.5rem', border: '1px solid rgba(255, 23, 68, 0.25)'}}>
            <div className="panel-title" style={{color:'var(--pink)'}}>LEFT STUDENTS PANEL (FORMER RESIDENTS)</div>
            <div className="cyber-table-wrap">
              <table className="cyber-table">
                <thead><tr><th>ID</th><th>Name</th><th>Room</th><th>Block</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {leftResidents.length===0 ? (
                    <tr><td colSpan={6} style={{textAlign:'center',color:'var(--text-3)',padding:'2rem'}}>No suspended or former students found.</td></tr>
                  ) : leftResidents.map(s=>(
                    <tr key={s.id}>
                      <td style={{fontFamily:'var(--font-mono)',fontSize:'.8rem'}}>{s.id}</td>
                      <td style={{fontWeight:600}}>{s.name}</td>
                      <td>{s.room_number}</td>
                      <td>{s.block}</td>
                      <td><span style={{color:statusColor(s.status),fontWeight:700,fontSize:'.8rem'}}>{s.status}</span></td>
                      <td>
                        <div style={{display:'flex',gap:'.4rem',flexWrap:'wrap'}}>
                          <button className="verify-btn unverified" onClick={()=>updateStatus(s.id,'Active')}>Activate</button>
                          <button className="verify-btn" style={{background:'rgba(255,23,68,0.1)',color:'#ff1744',border:'1px solid rgba(255,23,68,0.4)',fontWeight:700}} onClick={()=>deleteStudent(s.id, s.name)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Flagged Accounts */}
          <div className="panel-card">
            <div className="panel-title">FLAGGED / SUSPICIOUS ACCOUNTS</div>
            <div className="cyber-table-wrap">
              <table className="cyber-table">
                <thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Score</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {suspicious.length===0 ? <tr><td colSpan={6} style={{textAlign:'center',color:'var(--text-3)',padding:'2rem'}}>No flagged accounts.</td></tr>
                  : suspicious.map(s=>(
                    <tr key={s.id}>
                      <td style={{fontFamily:'var(--font-mono)',fontSize:'.8rem'}}>{s.id}</td>
                      <td style={{fontWeight:600}}>{s.name}</td>
                      <td style={{fontSize:'.8rem',color:'var(--text-2)'}}>{s.email}</td>
                      <td><span style={{color:'var(--orange)',fontWeight:700,fontFamily:'var(--font-mono)'}}>{s.suspicious_score}</span></td>
                      <td><span className="badge badge-suspicious">{s.status}</span></td>
                      <td>
                        <div style={{display:'flex',gap:'.4rem'}}>
                          <button className="verify-btn verified" onClick={()=>suspAction(s.id,'approve')}>Approve</button>
                          <button className="verify-btn unverified" onClick={()=>suspAction(s.id,'ban')}>Ban</button>
                          <button className="verify-btn" style={{background:'var(--red-dim)',color:'var(--red)',border:'1px solid rgba(255,23,68,.3)'}} onClick={()=>suspAction(s.id,'reject')}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>)}

        {/* ——— LEAVE REQS TAB ——— */}
        {tab==='leave' && (
          <div className="panel-card">
            <div className="panel-title">LONG LEAVE REQUESTS</div>
            <div className="cyber-table-wrap">
              <table className="cyber-table">
                <thead><tr><th>Student</th><th>Period</th><th>Return Meal</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {leaves.length===0 ? <tr><td colSpan={5} style={{textAlign:'center',color:'var(--text-3)',padding:'2rem'}}>No leave requests.</td></tr>
                  : leaves.map(l=>(
                    <tr key={l.id}>
                      <td><div style={{fontWeight:600}}>{l.Student?.name||l.student_id}</div><div style={{fontSize:'.72rem',color:'var(--text-3)',fontFamily:'var(--font-mono)'}}>{l.student_id}</div></td>
                      <td style={{fontFamily:'var(--font-mono)',fontSize:'.82rem'}}>{l.start_date} → {l.end_date}</td>
                      <td style={{textTransform:'capitalize'}}>{l.return_meal}</td>
                      <td><span className={`badge ${l.status==='Approved'?'badge-active':l.status==='Rejected'?'badge-suspended':'badge-suspicious'}`}>{l.status}</span></td>
                      <td>
                        {l.status==='Pending' && (
                          <div style={{display:'flex',gap:'.4rem'}}>
                            <button className="verify-btn verified" onClick={()=>leaveAction(l.id,'Approve')}>Approve</button>
                            <button className="verify-btn" style={{background:'var(--red-dim)',color:'var(--red)',border:'1px solid rgba(255,23,68,.3)'}} onClick={()=>leaveAction(l.id,'Reject')}>Reject</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/admin-login" element={<Navigate to="/login?type=admin" replace />} />
        <Route path="/register" element={<Register />} />
        <Route path="/verify" element={<VerifyOTP />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/student" element={<StudentDashboard />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
