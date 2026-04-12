# 贡献指南 / Contributing Guide

感谢您对 STARLIMS DevTools 项目的关注！我们欢迎各种形式的贡献。

## 开发环境设置 / Development Setup

### 前置要求 / Prerequisites

- Node.js (18.x 或更高版本)
- npm (随 Node.js 一起安装)
- Git

### 克隆和安装 / Clone and Install

```bash
# 克隆仓库
git clone <repository-url>
cd starlims-devtools

# 安装依赖
npm install
```

## 开发工作流程 / Development Workflow

### 1. 创建功能分支 / Create a Feature Branch

```bash
git checkout -b my-new-feature
```

### 2. 进行代码修改 / Make Your Changes

请遵循项目的代码规范：
- 使用 TypeScript 进行开发
- 遵循 ESLint 规则
- 使用有意义的变量和函数命名
- 为复杂逻辑添加注释
- 保持函数专注于单一职责

### 3. 运行代码检查 / Run Linter

```bash
npm run lint
```

### 4. 开发模式运行 / Run Development Mode

```bash
npm run dev
```

### 5. 构建生产版本 / Build for Production

```bash
npm run build
```

### 6. 提交代码 / Commit Your Changes

```bash
git commit -am 'Add some feature'
```

### 7. 推送到远程 / Push to Remote

```bash
git push origin my-new-feature
```

### 8. 创建 Pull Request / Submit a Pull Request

## 构建命令 / Build Commands

| 命令 | 描述 |
|------|------|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 构建生产版本 |
| `npm run lint` | 运行 ESLint 代码检查 |
| `npm run electron:dev` | 启动 Electron 开发模式 |

## 代码风格 / Code Style

- 遵循 TypeScript 最佳实践
- 使用 ESLint 配置的规则
- 组件使用函数式编程风格 (React Hooks)
- UI 使用 Tailwind CSS 工具类

## 项目结构 / Project Structure

```
src/
├── components/       # React 组件 / React components
│   ├── Editor/      # 代码编辑器组件 / Code editor components
│   ├── Sidebar/     # 企业树和侧边栏 / Enterprise tree and sidebar
│   ├── AIAssistant/  # AI 助手面板 / AI Assistant panel
│   └── SCM/          # 源代码管理器 / Source Control Manager
├── services/         # API 服务 / API services
├── stores/           # Zustand 状态管理 / Zustand state stores
├── ai/               # AI 模型提供程序 / AI model providers
└── types/            # TypeScript 类型定义 / TypeScript type definitions
```

## 问题反馈 / Questions?

如果您有任何问题或需要帮助，请通过 GitHub Issues 与我们联系。

---

Thank you for your interest in contributing to STARLIMS DevTools!

## Development Setup

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/starlims-devtools.git
   cd starlims-devtools
   ```
3. **Install dependencies**:
   ```bash
   npm install
   ```

## Development Workflow

1. **Create a feature branch**:
   ```bash
   git checkout -b my-new-feature
   ```

2. **Make your changes** following the project's coding standards

3. **Run linter** to check code quality:
   ```bash
   npm run lint
   ```

4. **Compile and test** your changes:
   ```bash
   npm run dev
   ```

5. **Commit your changes**:
   ```bash
   git commit -am 'Add some feature'
   ```

6. **Push to your fork**:
   ```bash
   git push origin my-new-feature
   ```

7. **Submit a pull request** to the main repository

## Build Commands

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run lint` - Check code quality with ESLint
- `npm run electron:dev` - Start Electron in development mode

## Code Style

- Follow TypeScript best practices
- Use functional components with React Hooks
- Use Tailwind CSS utility classes for styling
- Keep functions focused and concise
- Add comments for complex logic

## Questions?

If you have any questions or need help, please open an issue on GitHub.
