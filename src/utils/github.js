import {APP_CONFIG} from "@/config/version";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
// 系统默认中转仓库名
const TRANSFER_REPO_NAME = 'myDockerHub';

// 获取当前github用户信息
const getUsername = async () => {
    try {
        if (!GITHUB_TOKEN) {
            throw new Error('GitHub Token未设置,请在环境变量中配置GITHUB_TOKEN');
        }
        const response = await fetch('https://api.github.com/user', {
            headers: {
                'Authorization': `Bearer ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (!response.ok) {
            throw new Error('获取用户信息失败');
        }

        const data = await response.json();
        return data.login;
    } catch (error) {
        throw error;
    }
};

export const checkGithubRepo = async (repoName = TRANSFER_REPO_NAME) => {
    try {
        // 先获取用户名
        const username = await getUsername();

        const response = await fetch(`https://api.github.com/repos/${username}/${repoName}`, {
            headers: {
                'Authorization': `Bearer ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (response.status === 404) {
            return {exists: false};
        }

        if (response.ok) {
            const data = await response.json();
            return {exists: true, data};
        }

        throw new Error('获取仓库信息失败');
    } catch (error) {
        throw error;
    }
};

export const createGithubRepo = async () => {
    try {
        const response = await fetch('https://api.github.com/user/repos', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: TRANSFER_REPO_NAME,
                private: true,
                auto_init: true,
                description: '我的Docker Hub镜像私服中转仓库 - by pocker'
            })
        });

        if (!response.ok) {
            throw new Error('创建仓库失败');
        }

        return await response.json();
    } catch (error) {
        throw error;
    }
};

// 系统默认中转工作流
const TRANSFER_WORKFLOW_FILE = '.github/workflows/docker-publish.yml';
// 自动更新工作流
const AUTO_UPDATE_WORKFLOW_FILE = '.github/workflows/auto-update.yml';


export const checkWorkflowFile = async (workflowFile = TRANSFER_WORKFLOW_FILE, repo = TRANSFER_REPO_NAME) => {
    try {
        const username = await getUsername();
        const response = await fetch(`https://api.github.com/repos/${username}/${repo}/contents/${workflowFile}`, {
            headers: {
                'Authorization': `Bearer ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (response.status === 404) {
            return {exists: false};
        }

        if (response.ok) {
            const data = await response.json();
            // 解码 base64 内容
            const content = Buffer.from(data.content, 'base64').toString('utf-8');
            return {exists: true, content, sha: data.sha};
        }

        throw new Error('获取工作流文件失败');
    } catch (error) {
        throw error;
    }
};

// 默认工作流内容
const DEFAULT_WORKFLOW_CONTENT = `
name: Docker Image CI

on:
  repository_dispatch:
    types:
      - startTransfer
  workflow_dispatch:

jobs:
  docker:
    runs-on: ubuntu-latest
    steps:
      - name: Pull Docker image from Docker Hub
        run: |
          docker pull 源Docker Hub镜像地址

      - name: Login to HuaWei Docker Hub
        uses: docker/login-action@v3
        with:
          registry: swr.cn-north-4.myhuaweicloud.com
          username: 华为云账号
          password: 华为云容器镜像服务初始化的密码

      - name: Tag the image for HuaWei
        run: |
          docker tag 源Docker Hub镜像地址 目标容器镜像地址

      - name: Push the image to HuaWei Docker Hub
        run: |
          docker push 目标容器镜像地址
`;

// 创建工作流文件
export const createWorkflowFile = async (workflowContent = DEFAULT_WORKFLOW_CONTENT, repo = TRANSFER_REPO_NAME, workflowFile = TRANSFER_WORKFLOW_FILE, message = 'Add Docker publish workflow') => {
    try {
        const username = await getUsername();
        const response = await fetch(`https://api.github.com/repos/${username}/${repo}/contents/${workflowFile}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message,
                content: Buffer.from(workflowContent).toString('base64')
            })
        });

        if (!response.ok) {
            throw new Error('创建工作流文件失败');
        }

        return await response.json();
    } catch (error) {
        throw error;
    }
};

// 自动更新工作流内容
const AUTO_UPDATE_WORKFLOW_CONTENT =
    `name: Upstream Sync

permissions:
  contents: write
  issues: write

on:
  schedule:
    - cron: '0 */6 * * *' # every 6 hours
  workflow_dispatch:

jobs:
  sync_latest_from_upstream:
    name: Sync latest commits from upstream repo
    runs-on: ubuntu-latest

    steps:
      - name: Check for self-reference
        id: self_check
        run: |
          UPSTREAM_REPO="scoful/pocker"
          CURRENT_REPO="\${{github.repository}}"
          if [ "$UPSTREAM_REPO" = "$CURRENT_REPO" ]; then
            echo "Self-reference detected: upstream ($UPSTREAM_REPO) matches current repository ($CURRENT_REPO). Aborting workflow."
            echo "abort=true" >> $GITHUB_OUTPUT
          else
            echo "No self-reference detected."
            echo "abort=false" >> $GITHUB_OUTPUT
          fi

      - uses: actions/checkout@v4
        if: steps.self_check.outputs.abort == 'false'
        with:
          token: \${{secrets.GITHUB_TOKEN}}

      - name: Set up Git
        if: steps.self_check.outputs.abort == 'false'
        run: |
          git config --global user.name "GitHub Action"
          git config --global user.email "action@github.com"

      - name: Check if sync is needed
        if: steps.self_check.outputs.abort == 'false'
        id: check
        run: |
          # Clone upstream repository
          git clone https://github.com/scoful/pocker.git temp
          # Calculate hash of upstream src/config/version.js
          if [ -f temp/src/config/version.js ]; then
            UPSTREAM_HASH=$(sha256sum temp/src/config/version.js | awk '{print $1}')
          else
            echo "Warning: src/config/version.js not found in upstream. Assuming no sync needed."
            UPSTREAM_HASH=""
          fi
          # Calculate hash of local src/config/version.js
          if [ -f src/config/version.js ]; then
            LOCAL_HASH=$(sha256sum src/config/version.js | awk '{print $1}')
          else
            echo "Warning: src/config/version.js not found locally. Triggering sync."
            LOCAL_HASH=""
          fi
          # Compare hashes
          if [ "$UPSTREAM_HASH" = "$LOCAL_HASH" ] && [ -n "$UPSTREAM_HASH" ]; then
            echo "No sync needed, src/config/version.js contents match."
            echo "needs_sync=false" >> $GITHUB_OUTPUT
          else
            echo "Sync needed, src/config/version.js differs (upstream=$UPSTREAM_HASH, local=$LOCAL_HASH)."
            echo "needs_sync=true" >> $GITHUB_OUTPUT
          fi
          # Cleanup
          rm -rf temp

      - name: Clean issue notice
        if: steps.self_check.outputs.abort == 'false' && steps.check.outputs.needs_sync == 'true'
        uses: actions-cool/issues-helper@v3
        with:
          actions: 'close-issues'
          labels: '🚨 Sync Fail'

      - name: Sync upstream changes
        if: steps.self_check.outputs.abort == 'false' && steps.check.outputs.needs_sync == 'true'
        id: sync
        run: |
          cp -r .github/workflows/auto-update.yml /tmp/auto-update.yml
          find . -maxdepth 1 -not -path './.git' -not -path . -exec rm -rf {} \\;
          git clone https://github.com/scoful/pocker.git temp
          rsync -av --exclude='.git' --exclude='.github/workflows/auto-update.yml' temp/ .
          rm -rf temp
          mkdir -p .github/workflows && mv /tmp/auto-update.yml .github/workflows/auto-update.yml
          git add .
          git commit -m "Sync with scoful/pocker" || true
          if ! git push origin main; then
            echo "Push failed."
            echo "error_logs=$(git push origin main 2>&1)" >> $GITHUB_OUTPUT
            exit 1
          fi

      - name: Sync check
        if: steps.self_check.outputs.abort == 'false' && steps.check.outputs.needs_sync == 'true' && failure()
        uses: actions-cool/issues-helper@v3
        with:
          actions: 'create-issue'
          title: '🚨 同步失败 | Sync Fail'
          labels: '🚨 Sync Fail'
          body: |
            Failed to sync with upstream repository [scoful][pocker]. Please check the error logs below and manually sync if necessary.

            无法与上游仓库 [scoful][pocker] 同步。请查看下面的错误日志，并根据需要手动同步。

            **Error Logs:**
            \`\`\`
            \${{steps.sync.outputs.error_logs || 'No detailed logs captured.'}}
            \`\`\`

            [pocker]: https://github.com/scoful/pocker

      - name: Cleanup
        if: always()
        run: rm -f sync_error.log push_error.log
`;

export const configureAutoUpdate = async (repo) => {
    await createWorkflowFile(AUTO_UPDATE_WORKFLOW_CONTENT, repo, AUTO_UPDATE_WORKFLOW_FILE, "Add auto update workflow")
};

// 更新工作流文件
export const updateWorkflowFile = async (sourceImage, targetImage, region, sourceType = 'dockerhub') => {
    try {
        const username = await getUsername();
        const huaweicloud_username = process.env.NEXT_PUBLIC_HUAWEICLOUD_USERNAME;
        let newUsername = '';
        if (huaweicloud_username && huaweicloud_username.includes('@')) {
            const parts = huaweicloud_username.split('@');
            newUsername = `${region}@${parts[1]}`;
        } else {
            newUsername = huaweicloud_username || '';
        }

        // 根据源类型设置不同的拉取命令和镜像名称
        let pullCommand = '';
        let sourceImageWithTag = '';
        if (sourceType === 'ghcr') {
            pullCommand = `docker pull ghcr.io/${sourceImage}`;
            sourceImageWithTag = `ghcr.io/${sourceImage}`;
        } else {
            pullCommand = `docker pull ${sourceImage}`;
            sourceImageWithTag = sourceImage;
        }

        const workflowContent = `
name: Docker Image CI

on:
  repository_dispatch:
    types:
      - startTransfer
  workflow_dispatch:

jobs:
  docker:
    runs-on: ubuntu-latest
    steps:
      - name: Pull Docker image from ${sourceType === 'ghcr' ? 'GitHub Container Registry' : 'Docker Hub'}
        run: |
          ${pullCommand}

      - name: Login to HuaWei Docker Hub
        uses: docker/login-action@v3
        with:
          registry: swr.${region}.myhuaweicloud.com
          username: ${newUsername}
          password: ${process.env.HUAWEICLOUD_PASSWORD}

      - name: Tag the image for HuaWei
        run: |
          docker tag ${sourceImageWithTag} ${targetImage}

      - name: Push the image to HuaWei Docker Hub
        run: |
          docker push ${targetImage}
`;

        // 先检查文件是否存在
        const checkResult = await checkWorkflowFile();
        const method = checkResult.exists ? 'PUT' : 'POST';
        const body = {
            message: sourceImage,
            content: Buffer.from(workflowContent).toString('base64')
        };

        // 如果文件存在，需要提供 sha
        if (checkResult.exists) {
            body.sha = checkResult.sha;
        }

        const response = await fetch(`https://api.github.com/repos/${username}/${TRANSFER_REPO_NAME}/contents/${TRANSFER_WORKFLOW_FILE}`, {
            method,
            headers: {
                'Authorization': `Bearer ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            throw new Error('更新工作流文件失败');
        }

        return await response.json();
    } catch (error) {
        throw error;
    }
};

// 触发工作流
export const triggerWorkflow = async (eventType = 'startTransfer') => {
    try {
        const username = await getUsername();
        const response = await fetch(
            `https://api.github.com/repos/${username}/${TRANSFER_REPO_NAME}/dispatches`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${GITHUB_TOKEN}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    event_type: eventType
                })
            }
        );

        if (!response.ok) {
            throw new Error('触发工作流失败');
        }

        return true;
    } catch (error) {
        throw error;
    }
};

// 检查工作流运行状态
export const checkWorkflowRun = async () => {
    try {
        const username = await getUsername();
        const response = await fetch(
            `https://api.github.com/repos/${username}/${TRANSFER_REPO_NAME}/actions/runs?event=repository_dispatch&page=1&per_page=1&exclude_pull_requests=false`,
            {
                headers: {
                    'Authorization': `Bearer ${GITHUB_TOKEN}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            }
        );

        if (!response.ok) {
            throw new Error('检查工作流状态失败');
        }

        const data = await response.json();
        if (data.workflow_runs.length > 0) {
            const latestRun = data.workflow_runs[0];
            return {
                status: latestRun.status,
                conclusion: latestRun.conclusion,
                id: latestRun.id
            };
        }

        return null;
    } catch (error) {
        throw error;
    }
};

export const getWorkflowList = async ({page = 1, per_page = 10} = {}) => {
    try {
        const username = await getUsername();
        const response = await fetch(
            `https://api.github.com/repos/${username}/${TRANSFER_REPO_NAME}/actions/runs?event=repository_dispatch&exclude_pull_requests=false&page=${page}&per_page=${per_page}`,
            {
                headers: {
                    'Authorization': `Bearer ${GITHUB_TOKEN}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            }
        );

        if (!response.ok) {
            throw new Error('获取工作流列表失败：ResourceNotFound');
        }

        return await response.json();
    } catch (error) {
        throw error;
    }
};

export const getLatestCommit = async () => {
    try {
        const response = await fetch('https://api.github.com/repos/scoful/pocker/commits/master', {
            headers: {
                'Authorization': `Bearer ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        const data = await response.json();

        return {
            currentVersion: process.env.VERCEL_GIT_COMMIT_SHA || null,
            latestVersion: data.sha || null
        };
    } catch (error) {
        console.error('Failed to fetch version:', error);
        throw error;
    }
}

export const getLatestTag = async () => {
    try {
        const response = await fetch('https://api.github.com/repos/scoful/pocker/tags', {
            headers: {
                'Authorization': `Bearer ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        const data = await response.json();

        return {
            currentVersion: APP_CONFIG.version,
            latestVersion: data[0].name || null
        };
    } catch (error) {
        console.error('Failed to fetch version:', error);
        throw error;
    }
}