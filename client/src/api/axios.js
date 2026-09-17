import axios from 'axios';

let inMemoryToken = null;
let currentSocketId = null;

export const setAuthToken = (token) => {
  inMemoryToken = token;
};

export const getAuthToken = () => {
  return inMemoryToken;
};

export const setSocketId = (id) => {
  currentSocketId = id;
};

export const getSocketId = () => {
  return currentSocketId;
};

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: Inject Bearer token and x-socket-id header
api.interceptors.request.use(
  (config) => {
    if (inMemoryToken && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${inMemoryToken}`;
    }
    if (currentSocketId) {
      config.headers['x-socket-id'] = currentSocketId;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: Silent 401 refresh with infinite loop guard
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Check if error is 401 and request hasn't been retried yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      // Guard against infinite loops: do not retry if refresh or login endpoints fail
      const isAuthEndpoint =
        originalRequest.url?.includes('/auth/refresh') ||
        originalRequest.url?.includes('/auth/login') ||
        originalRequest.url?.includes('/auth/signup');

      if (isAuthEndpoint) {
        return Promise.reject(error);
      }

      originalRequest._retry = true;

      try {
        // Attempt token refresh via HttpOnly cookie
        const { data } = await axios.post('/api/auth/refresh', {}, { withCredentials: true });

        if (data?.accessToken) {
          setAuthToken(data.accessToken);
          originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
          return api(originalRequest);
        }
      } catch (refreshError) {
        setAuthToken(null);
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);
