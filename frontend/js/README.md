# Frontend JavaScript Modules

Organized frontend codebase using modular architecture.

## Directory Structure

```
js/
├── state.js              # Centralized application state management
├── uiHelpers.js          # UI utility functions and helpers
├── api/
│   ├── apiClient.js      # API communication layer
│   └── README.md         # API documentation
├── components/           # Feature-specific components
│   ├── auth.js           # Authentication component
│   ├── dashboard.js      # Dashboard overview
│   ├── earlyWarning.js   # Early warning system
│   ├── studentAnalysis.js# Student analysis features
│   ├── anomalyDetection.js
│   ├── interventions.js  # Intervention tracking
│   ├── settings.js       # User settings
│   ├── aiIntegration.js  # AI features integration
│   ├── modelManagement.js# ML model management
│   └── README.md         # Component documentation
└── main.js              # Application entry point
```

## State Management

The application uses **centralized state management** via `AppState` (see `state.js`):

- Single source of truth for all app state
- Event subscription system for component communication
- No global namespace pollution (only `AppState` and `UI` exposed)

### Usage Example:
```javascript
// Get state
const user = AppState.getUser();
const students = AppState.getStudents();

// Set state
AppState.setUser(userObj, token);
AppState.setStudents(studentList);

// Subscribe to changes
AppState.subscribe('auth', (state) => {
  console.log('Auth state updated:', state.auth);
});
```

## UI Utilities

The `UIHelpers` module provides common UI operations:

- Loading indicators
- Notifications/toasts
- Modal management
- Filter handling
- Chart management
- Element visibility toggling

### Usage Example:
```javascript
UI.showLoading(true);
UI.showNotification('Success!', 'success', 5000);
UI.showModal('myModal', { data: 'value' });
```

## API Communication

The `apiClient.js` automatically handles:

- API versioning (prepends `/v1` to all endpoints)
- Authentication (adds Bearer token)
- Error handling (401 redirects to login)
- Request/response formatting

### Adding API Endpoints:

```javascript
async function myEndpoint(params) {
  const res = await apiFetch('/my-endpoint', {
    method: 'POST',
    body: JSON.stringify(params)
  });
  return res?.json();
}
```

## Component Structure

Each component should:

1. **Initialize**: Set up event listeners and initial state
2. **Load Data**: Fetch from API when needed
3. **Subscribe**: Listen to state changes via `AppState`
4. **Render**: Update DOM based on state

### Example Component:
```javascript
// components/myFeature.js

async function loadMyFeature() {
  UI.showLoading(true);
  try {
    const data = await apiFetch('/my-feature');
    AppState.setMyData(data);
    render();
  } finally {
    UI.hideLoading();
  }
}

function render() {
  const data = AppState.getMyData();
  // Update DOM...
}

// Subscribe to state changes
AppState.subscribe('myData', render);
```

## Best Practices

### ✅ DO:
- Use `AppState` for shared state
- Use `UI` for UI operations
- Use `apiFetch()` for API calls
- Subscribe to state changes instead of pollling
- Handle errors gracefully with notifications

### ❌ DON'T:
- Use `window.*` globals for state
- Direct DOM manipulation without state sync
- Hardcode API URLs or versions
- Skip error handling
- Create multiple copies of the same state

## Migration Guide

To migrate existing components to the new modular architecture:

1. Replace `window.stateVariable` with `AppState.getStateVar()`
2. Replace state assignments with `AppState.setState()`
3. Remove direct event handlers, use state subscriptions
4. Update API calls to use `apiFetch()` 
5. Use `UI` helpers instead of manual UI manipulation

## Debugging

Enable debug mode in console:
```javascript
AppState.subscribe('*', (state) => {
  console.log('State updated:', state);
});
```

View current state:
```javascript
console.log(AppState);
```

## Performance Considerations

- Components only re-render when subscribed state changes
- API calls are debounced via component logic
- Chart instances are cached via `UI.registerChart()`
- Large data sets use pagination (via `DashboardFilterReq`)

## Contributing

When adding new features:

1. Define state in `AppState` (state.js)
2. Create API functions in relevant component
3. Subscribe to state in component render function
4. Use `UI` helpers for all UI operations
5. Update this README with new structure
