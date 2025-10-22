# Adaptive System Frontend - Claude-like Interface

A modern, responsive frontend for the Adaptive System (Multi-Agent Development) platform with a Claude-inspired chat interface.

## Features

### 🎨 Modern UI Design
- **Claude-like Interface**: Clean, modern design inspired by Claude's chat interface
- **Collapsible Sidebar**: Left sidebar with navigation and chat history
- **Responsive Design**: Works seamlessly on desktop and mobile devices
- **Real-time Chat**: Interactive chat interface for creating and managing tasks

### 📱 Interface Sections

#### 1. **Chat Interface** (Default)
- Main chat area for creating development tasks
- Real-time message history
- Send button and Enter key support
- Recent tasks sidebar integration

#### 2. **Agent Management**
- View and edit agent prompts
- Reset prompts to defaults
- Visual indicators for modified prompts
- Inline editing with save/cancel options

#### 3. **Workflow Configuration**
- Drag-and-drop style workflow builder
- Add/remove agents from workflow
- Reset to default workflow
- Visual workflow representation

#### 4. **Task Monitor**
- Real-time task status tracking
- Status icons (completed, in progress, failed, etc.)
- Task creation timestamps
- Task details and progress

#### 5. **System Settings**
- API key configuration
- Model selection (Gemini models)
- Usage statistics
- System status monitoring

### 🚀 Getting Started

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Start Development Server**
   ```bash
   npm run dev
   ```

3. **Access the Application**
   - Open your browser to `http://localhost:5173`
   - The interface will load with the chat section active

### 🎯 Usage Guide

#### Creating Tasks
1. Navigate to the **Chat** section (default)
2. Type your development request in the input area
3. Press Enter or click the Send button
4. The task will be created and you'll see a confirmation message
5. Switch to **Monitor** to track progress

#### Managing Agents
1. Click on **Agents** in the sidebar
2. View current agent prompts
3. Click the Edit button to modify prompts
4. Save changes or reset to defaults

#### Configuring Workflows
1. Navigate to **Workflows**
2. Add agents from the available list
3. Reorder or remove agents as needed
4. Reset to default workflow if needed

#### System Configuration
1. Go to **Settings**
2. Enter your Gemini API key
3. Select your preferred model
4. View usage statistics and system status

### 🎨 Design Features

#### Sidebar Navigation
- **Collapsible**: Toggle sidebar width for more screen space
- **Icons**: Visual navigation with descriptive icons
- **Active States**: Clear indication of current section
- **Chat History**: Recent tasks displayed in sidebar

#### Chat Interface
- **Message Bubbles**: User messages (blue) and bot responses (gray)
- **Timestamps**: Each message shows creation time
- **Auto-scroll**: Messages automatically scroll to bottom
- **Input Area**: Expandable textarea with send button

#### Responsive Design
- **Mobile-friendly**: Optimized for mobile devices
- **Touch Support**: Touch-friendly buttons and interactions
- **Flexible Layout**: Adapts to different screen sizes

### 🔧 Configuration

#### Backend URL
The backend URL is configured in `App.jsx`:
```javascript
const API_BASE_URL = 'http://157.66.191.31:5006/api';
```

To change the backend URL, simply update this constant.

#### Available Models
- gemini-2.5-flash
- gemini-2.5-pro
- gemini-1.5-pro
- gemini-1.5-flash
- gemini-1.0-pro

### 🛠️ Development

#### Project Structure
```
src/
├── App.jsx          # Main application component
├── App.css          # Global styles and animations
├── components/
│   └── ui/          # Reusable UI components
└── index.css        # Base styles
```

#### Key Components
- **App.jsx**: Main application with all sections
- **Chat Interface**: Real-time messaging
- **Sidebar**: Navigation and history
- **UI Components**: Reusable shadcn/ui components

#### Styling
- **Tailwind CSS**: Utility-first CSS framework
- **Custom Animations**: Smooth transitions and effects
- **Dark Mode Ready**: CSS variables for theming
- **Custom Scrollbars**: Enhanced user experience

### 🎯 Key Features

#### Real-time Updates
- Live task status updates
- Instant chat message display
- Real-time notification system

#### User Experience
- **Intuitive Navigation**: Clear section organization
- **Visual Feedback**: Loading states and status indicators
- **Error Handling**: User-friendly error messages
- **Responsive Design**: Works on all devices

#### Performance
- **Optimized Rendering**: Efficient React components
- **Lazy Loading**: Components load as needed
- **Smooth Animations**: 60fps animations and transitions

### 🔄 State Management

The application uses React hooks for state management:
- **useState**: Local component state
- **useEffect**: Side effects and API calls
- **Custom Hooks**: Reusable logic (if needed)

### 📊 API Integration

The frontend integrates with the Adaptive System backend API:
- **RESTful Endpoints**: Standard HTTP methods
- **Error Handling**: Graceful error management
- **Loading States**: User feedback during operations
- **Real-time Updates**: Live data synchronization

### 🎨 Customization

#### Colors and Theming
The application uses CSS custom properties for easy theming:
```css
:root {
  --primary: oklch(0.205 0 0);
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  /* ... more variables */
}
```

#### Component Styling
All UI components are built with shadcn/ui and can be customized through:
- CSS custom properties
- Tailwind utility classes
- Component-specific styling

### 🚀 Deployment

#### Build for Production
```bash
npm run build
```

#### Preview Production Build
```bash
npm run preview
```

### 📝 Notes

- The interface is designed to be intuitive and user-friendly
- All sections are accessible through the sidebar navigation
- The chat interface is the primary interaction method
- Real-time updates provide immediate feedback
- The design is responsive and works on all devices

### 🔗 Related

- **Backend API**: Adaptive System backend
- **Documentation**: Full system documentation
- **Deployment**: Docker and deployment guides 