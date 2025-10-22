# Adaptive Development Platform v3 - Complete Project Context

## 🎯 Project Overview

**Adaptive Development Platform v3** is a comprehensive multi-agent development platform that orchestrates AI agents to create complete software projects. The system uses **Official Gemini CLI** for all file creation and code generation, with Python only sending prompts and referencing files.

### Core Architecture
- **Python System**: Only sends prompts to Official Gemini CLI, does NOT create files directly
- **Official Gemini CLI**: Creates all files and folders directly using terminal commands
- **Agent Prompts**: Stored in `.sureai/` folder with user-prompt-specific timestamps
- **Document References**: Agents refer to previously created documents using `@filename` notation

## 🏗️ System Architecture

### Backend (Flask + Python)
- **Flask Application**: RESTful API endpoints for task management
- **Official Gemini CLI Client**: Direct integration with Official Gemini CLI tool
- **Agent Manager**: Manages agent prompts and configurations
- **Sequential Document Builder**: Orchestrates file creation via Gemini CLI
- **Python System**: Only sends prompts to Official Gemini CLI, does NOT create files directly

### Frontend (React + TypeScript)
- **React Application**: Modern UI for task management and monitoring
- **Real-time Updates**: WebSocket connection for live progress updates
- **Task Dashboard**: Visual representation of agent progress
- **Configuration Panel**: API key management and system settings

## 🤖 Agent System

### Agent Workflow Pattern
Each agent follows a **two-step process**:

1. **Step 1**: Create user-prompt-specific agent prompt file in `.sureai/` (hidden, timestamped)
2. **Step 2**: Refer to the created agent file using `@filename` and create actual documents

### Agent Sequence
1. **Directory Structure Agent**: Creates `.sureai/.directory_structure_{user_prompt}_{timestamp}.md` → Creates actual directory structure
2. **Orchestrator Agent**: Creates `.sureai/.orchestrator_agent_{user_prompt}_{timestamp}.md` → Creates `.sureai/.orchestrator_breakdown.md` and `.sureai/.orchestrator_plan.md`
3. **Analyst Agent**: Creates `.sureai/.analyst_agent_{user_prompt}_{timestamp}.md` → Creates `.sureai/analysis_document.md` and `.sureai/requirements_document.md`
4. **Architect Agent**: Creates `.sureai/.architect_agent_{user_prompt}_{timestamp}.md` → Creates `.sureai/architecture_document.md` and `.sureai/tech_stack_document.md`
5. **PM Agent**: Creates `.sureai/.pm_agent_{user_prompt}_{timestamp}.md` → Creates `.sureai/prd_document.md` and `.sureai/project_plan.md`
6. **Scrum Master Agent**: Creates `.sureai/.sm_agent_{user_prompt}_{timestamp}.md` → Creates `.sureai/tasks_list.md` and `.sureai/sprint_plan.md`
7. **Developer Agent**: Creates `.sureai/.developer_agent_{user_prompt}_{timestamp}.md` → **Updates `.sureai/tasks_list.md` by adding subtasks for each main task and creates `backend/` and `frontend/` code**
8. **DevOps Agent**: Creates `.sureai/.devops_agent_{user_prompt}_{timestamp}.md` → Creates deployment configuration files

### Agent Capabilities

#### 1. Directory Structure Agent
- **Role**: Creates project directory structure
- **Pattern**: Creates `.sureai/.directory_structure_{user_prompt}_{timestamp}.md` → Creates actual directory structure
- **Uses Official Gemini CLI** to create directories and files directly
- **Follows strict directory structure** from context.md

#### 2. Master Orchestrator Agent
- **Role**: Creates project breakdown and planning documents
- **Pattern**: Creates `.sureai/.orchestrator_agent_{user_prompt}_{timestamp}.md` → Creates Orchestrator documents
- **Uses Official Gemini CLI** to create breakdown and plan documents
- **References**: User prompt and base agent prompt

#### 3. Analyst Agent
- **Role**: Creates analysis and requirements documents
- **Pattern**: Creates `.sureai/.analyst_agent_{user_prompt}_{timestamp}.md` → Creates analysis documents
- **Uses Official Gemini CLI** to create analysis and requirements documents
- **References**: Orchestrator documents and user prompt

#### 4. Architect Agent
- **Role**: Creates architecture and tech stack documents
- **Pattern**: Creates `.sureai/.architect_agent_{user_prompt}_{timestamp}.md` → Creates architecture documents
- **Uses Official Gemini CLI** to create architecture and tech stack documents
- **References**: Analysis documents and user prompt

#### 5. PM Agent
- **Role**: Creates PRD and project plan documents
- **Pattern**: Creates `.sureai/.pm_agent_{user_prompt}_{timestamp}.md` → Creates PM documents
- **Uses Official Gemini CLI** to create PRD and project plan documents
- **References**: Analysis and architecture documents

#### 6. Scrum Master Agent
- **Role**: Creates tasks list and sprint plan documents
- **Pattern**: Creates `.sureai/.sm_agent_{user_prompt}_{timestamp}.md` → Creates SM documents
- **Uses Official Gemini CLI** to create tasks list and sprint plan documents
- **References**: PRD document

#### 7. Developer Agent
- **Role**: Creates code files and updates tasks list with subtasks
- **Pattern**: Creates `.sureai/.developer_agent_{user_prompt}_{timestamp}.md` → **Updates `.sureai/tasks_list.md` by adding subtasks for each main task and creates all code files**
- **Uses Official Gemini CLI** to create backend and frontend code files
- **References**: Tasks list, architecture, and tech stack documents
- **Important**: The developer agent does **not** create a separate `subtasks_list.md` file. Instead, it updates the existing `tasks_list.md` (created by the Scrum Master) by adding subtasks under each main task, preserving the original structure.

#### 8. DevOps Agent
- **Role**: Creates deployment configuration files
- **Pattern**: Creates `.sureai/.devops_agent_{user_prompt}_{timestamp}.md` → Creates deployment configs
- **Uses Official Gemini CLI** to create deployment configuration files
- **References**: Backend/frontend code and architecture document

## 🔄 Agent Execution Loop

### Workflow Process
1. **Task Creation**: User submits prompt via frontend
2. **Agent Sequence**: Python system orchestrates agent sequence
3. **Agent Prompt Creation**: Each agent creates user-prompt-specific agent file in `.sureai/`
4. **Document Creation**: Agent refers to created agent file and creates actual documents
5. **File References**: Subsequent agents refer to previous documents using `@filename`
6. **Send to Official Gemini CLI** via subprocess execution with `--yolo` flag
7. **Official Gemini CLI handles all file creation** directly using terminal commands
8. **Sequential Document Builder orchestrates file creation**

### File Reference Pattern
- **Agent Files**: Hidden files in `.sureai/` with dot prefix and timestamp
- **Document Files**: Visible files in `.sureai/` without dot prefix
- **Code Files**: Created in `backend/` and `frontend/` directories
- **Config Files**: Created at project root level

## 📁 File Structure

### Project Directory Structure (ENHANCED)
```
/tmp/adaptive_system_output/
└── {first_three_words}_{timestamp}/
    ├── .io8project/
    │   ├── .state.json                    # Task state persistence
    │   └── project_metadata.json          # Project metadata
    ├── .sureai/                           # Agent outputs and documents directory
    │   ├── .directory_structure_{user_prompt}_{timestamp}.md  # Hidden agent files
    │   ├── .orchestrator_agent_{user_prompt}_{timestamp}.md          # Hidden agent files
    │   ├── .analyst_agent_{user_prompt}_{timestamp}.md       # Hidden agent files
    │   ├── .architect_agent_{user_prompt}_{timestamp}.md     # Hidden agent files
    │   ├── .pm_agent_{user_prompt}_{timestamp}.md            # Hidden agent files
    │   ├── .sm_agent_{user_prompt}_{timestamp}.md            # Hidden agent files
    │   ├── .developer_agent_{user_prompt}_{timestamp}.md     # Hidden agent files
    │   ├── .devops_agent_{user_prompt}_{timestamp}.md        # Hidden agent files
    │   ├── .orchestrator_*.md                     # Hidden agent outputs (dot prefix)
    │   ├── .analyst_*.md                  # Hidden agent outputs (dot prefix)
    │   ├── .architect_*.md                # Hidden agent outputs (dot prefix)
    │   ├── .developer_*.md                # Hidden agent outputs (dot prefix)
    │   ├── .devops_*.md                   # Hidden agent outputs (dot prefix)
    │   ├── .pm_*.md                       # Hidden agent outputs (dot prefix)
    │   ├── analysis_document.md           # Visible documents (no dot prefix)
    │   ├── requirements_document.md       # Visible documents (no dot prefix)
    │   ├── architecture_document.md       # Visible documents (no dot prefix)
    │   ├── tech_stack_document.md         # Visible documents (no dot prefix)
    │   ├── prd_document.md               # Visible documents (no dot prefix)
    │   ├── project_plan.md               # Visible documents (no dot prefix)
    │   ├── tasks_list.md                 # Visible documents (no dot prefix, created by SM and updated by Developer with subtasks)
    │   ├── sprint_plan.md                # Visible documents (no dot prefix)
    ├── backend/                           # Backend code files (created by developer)
    ├── frontend/                          # Frontend code files (created by developer)
    ├── deployment_config.yml              # Root level deployment config
    ├── Dockerfile.backend                 # Root level backend Dockerfile
    ├── Dockerfile.frontend                # Root level frontend Dockerfile
    └── docker-compose.yml                 # Root level Docker compose file
```

### Directory Structure Rules

#### Hidden Files (Agent Prompts)
- **Location**: `.sureai/` directory
- **Naming**: Prefixed with dot (.) and timestamp
- **Purpose**: User-prompt-specific agent prompt files that Gemini CLI creates and then refers to
- **Examples**: 
  - `.directory_structure_todo_app_2957f2a7.md` (Directory Structure agent prompt)
  - `.orchestrator_agent_todo_app_2957f2a7.md` (Orchestrator agent prompt)
  - `.analyst_agent_todo_app_2957f2a7.md` (Analyst agent prompt)
  - `.architect_agent_todo_app_2957f2a7.md` (Architect agent prompt)
  - `.pm_agent_todo_app_2957f2a7.md` (PM agent prompt)
  - `.sm_agent_todo_app_2957f2a7.md` (Scrum Master agent prompt)
  - `.developer_agent_todo_app_2957f2a7.md` (Developer agent prompt)
  - `.devops_agent_todo_app_2957f2a7.md` (DevOps agent prompt)

#### Visible Documents (Actual Documents Created by Gemini CLI)
- **Location**: `.sureai/` directory
- **Naming**: No dot prefix
- **Purpose**: Actual documents that Gemini CLI generates based on the hidden agent prompt files
- **Examples**:
  - `analysis_document.md` (Created by Analyst agent based on `.analyst_agent_{user_prompt}_{timestamp}.md`)
  - `requirements_document.md` (Created by Analyst agent based on `.analyst_agent_{user_prompt}_{timestamp}.md`)
  - `architecture_document.md` (Created by Architect agent based on `.architect_agent_{user_prompt}_{timestamp}.md`)
  - `tech_stack_document.md` (Created by Architect agent based on `.architect_agent_{user_prompt}_{timestamp}.md`)
  - `prd_document.md` (Created by PM agent based on `.pm_agent_{user_prompt}_{timestamp}.md`)
  - `project_plan.md` (Created by PM agent based on `.pm_agent_{user_prompt}_{timestamp}.md`)
  - `tasks_list.md` (Created by Scrum Master agent based on `.sm_agent_{user_prompt}_{timestamp}.md`, **updated by Developer agent to add subtasks for each main task**)
  - `sprint_plan.md` (Created by Scrum Master agent based on `.sm_agent_{user_prompt}_{timestamp}.md`)

#### Code Files
- **Backend Code**: `backend/` directory (created by developer agent)
  - Python files, requirements.txt, etc.
- **Frontend Code**: `frontend/` directory (created by developer agent)
  - HTML, CSS, JavaScript files, etc.

#### Configuration Files
- **Location**: Project root level
- **Purpose**: Deployment and infrastructure configuration
- **Examples**:
  - `deployment_config.yml`
  - `Dockerfile.backend`
  - `Dockerfile.frontend`
  - `docker-compose.yml`

## 🔧 Technical Implementation

### Official Gemini CLI Client
- **Direct File System Access** via `--yolo` flag
- **Uses terminal commands** (`mkdir -p`, `cat >`, `touch`)
- **Intelligent Tool Selection**: Gemini CLI is intelligent enough to choose its own file writing tools based on the prompt - no need to explicitly mention which tool to use
- **Working Directory Management**: Creates files in correct task-specific project directory
- **Subprocess Integration**: Python system spawns Gemini CLI with proper working directory

### Sequential Document Builder
- **Agent Prompt Integration**: Gets agent prompts from AgentManager and combines with user prompts
- **Working Directory Management**: Passes project directory to Gemini CLI for correct file creation
- **Two-Step Process**: Each agent creates user-prompt-specific agent file first, then refers to it
- **File Reference System**: Uses `@filename` notation to reference previously created documents

### Agent Manager
- **Agent Prompt Loading**: Loads agent prompts from `.chatmode.md` files
- **Dynamic Agent Files**: Creates user-prompt-specific agent files in `.sureai/`
- **Timestamp Management**: Uses task ID for unique file naming

## 🚀 How It Works End-to-End

### 1. Task Creation
- User submits prompt via frontend
- Python system creates task with unique ID
- Project directory created in `/tmp/adaptive_system_output/{first_three_words}_{timestamp}/`

### 2. Agent Execution Sequence
- **Directory Structure Agent**:
  1. Creates `.sureai/.directory_structure_{user_prompt}_{timestamp}.md`
  2. Refers to this file and creates actual directory structure
- **Orchestrator Agent**:
  1. Creates `.sureai/.orchestrator_agent_{user_prompt}_{timestamp}.md`
  2. Refers to this file and creates Orchestrator documents
- **Analyst Agent**:
  1. Creates `.sureai/.analyst_agent_{user_prompt}_{timestamp}.md`
  2. Refers to this file and previous documents, creates analysis documents
- **Architect Agent**:
  1. Creates `.sureai/.architect_agent_{user_prompt}_{timestamp}.md`
  2. Refers to this file and previous documents, creates architecture documents
- **PM Agent**:
  1. Creates `.sureai/.pm_agent_{user_prompt}_{timestamp}.md`
  2. Refers to this file and previous documents, creates PRD and project plan
- **Scrum Master Agent**:
  1. Creates `.sureai/.sm_agent_{user_prompt}_{timestamp}.md`
  2. Refers to this file and previous documents, creates tasks list and sprint plan
- **Developer Agent**:
  1. Creates `.sureai/.developer_agent_{user_prompt}_{timestamp}.md`
  2. Refers to this file and previous documents, updates `.sureai/tasks_list.md` by adding subtasks for each main task and creates all code files
- **DevOps Agent**:
  1. Creates `.sureai/.devops_agent_{user_prompt}_{timestamp}.md`
  2. Refers to this file and previous documents, creates deployment configs

### 3. File Creation Process
- Python system sends comprehensive prompts to Official Gemini CLI
- Gemini CLI uses `--yolo` flag for direct file system access
- Gemini CLI creates files using terminal commands (`mkdir -p`, `cat >`, `touch`)
- All files created in correct project directory with proper structure

### 4. Document References
- Each agent refers to previously created documents using `@filename` notation
- Agent files are hidden in `.sureai/` with dot prefix and timestamp
- Document files are visible in `.sureai/` without dot prefix
- Code files created in `backend/` and `frontend/` directories

## 📋 Dependencies

### Backend Dependencies
```
Flask==2.3.3
Flask-CORS==4.0.0
Flask-SQLAlchemy==3.0.5
python-dotenv==1.0.0
requests==2.31.0
```

### Frontend Dependencies
```
React 18
TypeScript
Vite
Axios
Socket.io-client
```

### Official Gemini CLI
- **Installation**: `npm install -g @google/gemini-cli@latest --legacy-peer-deps`
- **Usage**: `gemini --yolo` with prompt via stdin
- **Capabilities**: Direct file system access, terminal command execution
- **Integration**: Python subprocess with working directory management

## 🔄 Development Workflow

### 1. Local Development
```bash
# Start backend
cd adaptive_system/backend
python src/main.py

# Start frontend
cd adaptive_system/frontend
npm run dev
```

### 2. Docker Development
```bash
# Build and run with Docker Compose
docker-compose up --build
```

### 3. Agent Testing
- Each agent creates user-prompt-specific files in `.sureai/`
- Agents refer to previous documents using `@filename`
- All file creation handled by Official Gemini CLI
- Python system only sends prompts and manages workflow

## 📊 Monitoring & Logging

### Agent Progress Tracking
- Real-time progress updates via WebSocket
- Agent-specific logging with timestamps
- File creation tracking in `.sureai/` directory
- Task completion status monitoring

### Error Handling
- Gemini CLI error logging and recovery
- Agent failure handling and retry mechanisms
- File system error detection and reporting
- API key validation and configuration

## 🎯 Key Features

### 1. Multi-Agent Orchestration
- **8 Specialized Agents**: Each with specific roles and capabilities
- **Sequential Execution**: Agents work in predefined sequence
- **Document Dependencies**: Each agent builds on previous agent outputs
- **File Reference System**: Agents refer to previous documents using `@filename`

### 2. Official Gemini CLI Integration
- **Direct File System Access**: Uses `--yolo` flag for terminal command execution
- **Intelligent Tool Selection**: Gemini CLI chooses best file writing tools
- **Working Directory Management**: Creates files in correct project directories
- **No Python Parsing**: Python system only sends prompts, Gemini CLI handles all file creation

### 3. Dynamic Agent Prompt System
- **User-Prompt-Specific Files**: Each agent creates customized prompt files
- **Timestamp Management**: Unique file naming with task ID timestamps
- **Hidden Agent Files**: Agent prompts stored in `.sureai/` with dot prefix
- **Document References**: Agents refer to previously created documents

### 4. Comprehensive Project Generation
- **Complete Codebase**: Backend and frontend code generation
- **Configuration Files**: Docker, deployment, and infrastructure configs
- **Documentation**: Analysis, requirements, architecture, and planning docs
- **Deployment Ready**: Full-stack applications ready for deployment

### 5. Real-time Monitoring
- **Live Progress Updates**: WebSocket-based real-time monitoring
- **Agent Status Tracking**: Individual agent progress and completion
- **File Creation Logging**: Detailed logging of all file operations
- **Error Detection**: Comprehensive error handling and reporting

## 🔧 Configuration

### Environment Variables
```bash
GEMINI_API_KEY=your_gemini_api_key_here
FLASK_ENV=development
DATABASE_URL=sqlite:///app.db
```

### Agent Configuration
- **Agent Prompts**: Stored in `adaptive_system_backend/src/agents/` directory
- **Agent Sequence**: Configurable in `SequentialDocumentBuilder`
- **File References**: Managed via `@filename` notation
- **Working Directories**: Set per task and agent execution

## 📈 Performance & Scalability

### Optimization Features
- **Parallel Agent Execution**: Future capability for concurrent agent execution
- **Caching System**: Agent prompt and document caching
- **Resource Management**: Efficient memory and CPU usage
- **Error Recovery**: Robust error handling and recovery mechanisms

### Scalability Considerations
- **Docker Containerization**: Easy deployment and scaling
- **Database Optimization**: Efficient task and document storage
- **API Rate Limiting**: Gemini API usage optimization
- **File System Management**: Efficient project directory handling

## 🎯 Future Enhancements

### Planned Features
1. **Parallel Agent Execution**: Concurrent agent processing
2. **Advanced Agent Types**: Specialized agents for specific domains
3. **Template System**: Reusable project templates
4. **Version Control Integration**: Git integration for project management
5. **Cloud Deployment**: Direct deployment to cloud platforms
6. **Advanced Monitoring**: Enhanced analytics and reporting
7. **Plugin System**: Extensible agent and tool system
8. **Multi-Project Support**: Concurrent project management

### Technical Improvements
1. **Performance Optimization**: Faster agent execution and file creation
2. **Error Recovery**: Enhanced error handling and recovery
3. **Security Enhancements**: Improved API key and data security
4. **User Experience**: Enhanced frontend interface and interactions
5. **Documentation**: Comprehensive system documentation
6. **Testing**: Automated testing and quality assurance
7. **Monitoring**: Advanced logging and monitoring capabilities
8. **Integration**: Third-party tool and service integration

## 📚 Documentation

### API Documentation
- **RESTful Endpoints**: Complete API documentation
- **WebSocket Events**: Real-time communication protocol
- **Agent Interfaces**: Agent-specific API documentation
- **Error Codes**: Comprehensive error code reference

### User Guides
- **Getting Started**: Quick start guide for new users
- **Agent Configuration**: Detailed agent setup and configuration
- **Project Management**: Complete project lifecycle management
- **Troubleshooting**: Common issues and solutions

### Developer Documentation
- **Architecture Overview**: System architecture and design
- **Agent Development**: Guide for creating new agents
- **Integration Guide**: Third-party integration documentation
- **Deployment Guide**: Production deployment instructions

## 🔒 Security & Compliance

### Security Features
- **API Key Management**: Secure Gemini API key handling
- **Input Validation**: Comprehensive input sanitization
- **Error Handling**: Secure error reporting and logging
- **File System Security**: Safe file creation and management

### Compliance
- **Data Privacy**: User data protection and privacy
- **Audit Logging**: Comprehensive activity logging
- **Access Control**: Role-based access and permissions
- **Data Retention**: Configurable data retention policies

## 🎯 Success Metrics

### Performance Indicators
- **Agent Execution Time**: Average time per agent execution
- **File Creation Success Rate**: Percentage of successful file creations
- **User Satisfaction**: User feedback and satisfaction scores
- **System Reliability**: Uptime and error rates

### Quality Metrics
- **Code Quality**: Generated code quality and standards
- **Document Completeness**: Analysis and requirement document quality
- **Project Completeness**: Percentage of complete project generation
- **Deployment Success**: Successful deployment rate

## 🚀 Getting Started

### Prerequisites
1. **Python 3.8+**: Backend runtime environment
2. **Node.js 16+**: Frontend runtime environment
3. **Docker**: Containerization (optional)
4. **Gemini API Key**: Official Gemini CLI access

### Installation
```bash
# Clone the repository
git clone <repository-url>
cd adaptive_system_enhanced_v3_complete

# Install backend dependencies
cd adaptive_system/backend
pip install -r requirements.txt

# Install frontend dependencies
cd ../adaptive_system/frontend
npm install

# Install Official Gemini CLI
npm install -g @google/gemini-cli@latest --legacy-peer-deps

# Set environment variables
export GEMINI_API_KEY=your_api_key_here
```

### Running the System
```bash
# Start backend
cd adaptive_system/backend
python src/main.py

# Start frontend (in new terminal)
cd adaptive_system/frontend
npm run dev

# Or use Docker Compose
docker-compose up --build
```

### First Task
1. **Access Frontend**: Navigate to `http://localhost:5005`
2. **Configure API Key**: Enter your Gemini API key
3. **Create Task**: Submit your first project prompt
4. **Monitor Progress**: Watch agents execute in sequence
5. **Download Results**: Access generated project files

## 🎯 Conclusion

The **Adaptive System Enhanced v3** represents a comprehensive solution for automated software project generation using Official Gemini CLI. The system's unique two-step agent pattern, where each agent creates user-prompt-specific files and then refers to them, ensures consistent and high-quality project generation.

Key strengths include:
- **Official Gemini CLI Integration**: Direct file system access and intelligent tool selection
- **Dynamic Agent System**: User-prompt-specific agent files with timestamp management
- **Comprehensive Workflow**: Complete project lifecycle from analysis to deployment
- **Real-time Monitoring**: Live progress tracking and error handling
- **Scalable Architecture**: Docker-based deployment and extensible agent system

The system is designed for developers, project managers, and organizations seeking to accelerate software development through AI-powered automation while maintaining high quality and consistency standards. 