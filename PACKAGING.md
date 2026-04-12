# 打包和发布指南 / Packaging and Publishing Guide

本文档说明如何打包和发布 STARLIMS DevTools 桌面应用程序。

## 目录 / Table of Contents

- [中文版本](#中文版本)
  - [环境要求](#环境要求)
  - [本地打包](#本地打包)
  - [Windows 安装程序](#windows-安装程序)
- [English Version](#english-version)
  - [Prerequisites](#prerequisites)
  - [Local Packaging](#local-packaging)
  - [Windows Installer](#windows-installer)

---

## 中文版本

### 环境要求

打包和发布应用程序之前，请确保已安装以下工具：

- **Node.js** (18.x 或更高版本)
- **npm** (随 Node.js 一起安装)
- **Git** (用于版本控制)

#### 安装依赖

```bash
# 1. 克隆仓库
git clone <repository-url>
cd starlims-devtools

# 2. 安装项目依赖
npm install
```

### 本地打包

使用 electron-builder 进行打包。

#### 构建前端和 Electron 代码

```bash
npm run build
```

此命令会：
1. 运行 TypeScript 编译
2. 使用 Vite 构建前端代码
3. 使用 electron-builder 打包应用程序

#### 输出目录

打包后的文件位于 `release` 目录：
- `release/win-unpacked/` - 便携版（无需安装）
- `release/` - Windows 安装包（如果配置了 NSIS）

### Windows 安装程序

要创建 Windows NSIS 安装程序：

1. 确保 `package.json` 中的 build 配置正确
2. 运行构建命令
3. 在 `release` 目录中查找 `.exe` 安装文件

### 版本管理

```bash
# 升级补丁版本 (1.0.0 -> 1.0.1)
npm version patch

# 升级次要版本 (1.0.0 -> 1.1.0)
npm version minor

# 升级主要版本 (1.0.0 -> 2.0.0)
npm version major
```

---

## English Version

### Prerequisites

Before packaging and publishing the application, ensure you have the following tools installed:

- **Node.js** (18.x or higher)
- **npm** (included with Node.js)
- **Git** (for version control)

#### Install Dependencies

```bash
# 1. Clone the repository
git clone <repository-url>
cd starlims-devtools

# 2. Install project dependencies
npm install
```

### Local Packaging

The project uses electron-builder for packaging.

#### Build Frontend and Electron Code

```bash
npm run build
```

This command will:
1. Run TypeScript compilation
2. Build frontend code using Vite
3. Package the application using electron-builder

#### Output Directory

Packaged files are located in the `release` directory:
- `release/win-unpacked/` - Portable version (no installation required)
- `release/` - Windows installer (if NSIS is configured)

### Windows Installer

To create a Windows NSIS installer:

1. Ensure build configuration in `package.json` is correct
2. Run the build command
3. Find the `.exe` installer in the `release` directory

### Version Management

```bash
# Bump patch version (1.0.0 -> 1.0.1)
npm version patch

# Bump minor version (1.0.0 -> 1.1.0)
npm version minor

# Bump major version (1.0.0 -> 2.0.0)
npm version major
```

## Additional Resources

- [Electron Builder Documentation](https://www.electron.build/)
- [Vite Documentation](https://vitejs.dev/)
- [electron-builder npm package](https://www.npmjs.com/package/electron-builder)
