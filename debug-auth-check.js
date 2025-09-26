// Debug script to check authentication status
// Run this in the browser console

function debugAuth() {
  console.log('=== DEBUG AUTH STATUS ===');
  
  // Check localStorage
  const authUser = localStorage.getItem('auth-user');
  console.log('localStorage auth-user:', authUser);
  
  if (authUser) {
    try {
      const parsed = JSON.parse(authUser);
      console.log('Parsed user object:', parsed);
      console.log('User ID:', parsed.id);
      console.log('User email:', parsed.email);
      console.log('User role:', parsed.role);
    } catch (e) {
      console.error('Failed to parse auth-user:', e);
    }
  } else {
    console.warn('No auth-user found in localStorage');
  }
  
  // Test getUserId function
  function testGetUserId() {
    const user = localStorage.getItem('auth-user');
    if (!user) {
      console.warn('No auth-user found in localStorage');
      return null;
    }
    
    try {
      const parsed = JSON.parse(user);
      console.log('getUserId - parsed user:', parsed);
      return parsed.id || null;
    } catch (error) {
      console.error('Error parsing auth-user from localStorage:', error);
      return null;
    }
  }
  
  const userId = testGetUserId();
  console.log('Function getUserId() returns:', userId);
  
  // Test headers
  const headers = { "Content-Type": "application/json" };
  if (userId) {
    headers['user-id'] = userId;
  }
  console.log('Headers that would be sent:', headers);
  
  console.log('=== END DEBUG ===');
}

// Run the debug
debugAuth();