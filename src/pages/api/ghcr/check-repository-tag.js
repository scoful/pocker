import {withAuth} from '@/utils/withAuth';
import {SocksProxyAgent} from 'socks-proxy-agent';
import fetch from 'node-fetch';

const handler = async (req, res) => {
    const {image} = req.query;

    // 验证 image 参数
    if (!image || typeof image !== 'string') {
        return res.status(400).json({error: '无效的 image 参数'});
    }

    // 解码 URL 编码的参数
    let decodedImage;
    try {
        decodedImage = decodeURIComponent(image);
        console.log('解码后的镜像地址:', decodedImage);
    } catch (error) {
        return res.status(400).json({error: 'URL 解码失败'});
    }

    // 默认命名空间和标签
    let namespace = '';
    let repository = '';
    let tag = 'latest';

    // 解析 image (格式: namespace/repository:tag)
    if (!decodedImage.includes('/')) {
        return res.status(400).json({error: 'GHCR 镜像地址必须包含 namespace/repository 格式'});
    }

    const parts = decodedImage.split('/');
    if (parts.length !== 2) {
        return res.status(400).json({error: 'GHCR 镜像地址格式不正确，应为 namespace/repository:tag'});
    }

    namespace = parts[0];
    
    // 处理 repository 和 tag
    if (parts[1].includes(':')) {
        const repoParts = parts[1].split(':');
        repository = repoParts[0];
        tag = repoParts[1];
    } else {
        repository = parts[1];
    }

    console.log('解析后的参数:', { namespace, repository, tag });

    // 验证 namespace 和 repository 不为空
    if (!namespace || !repository) {
        return res.status(400).json({error: 'namespace 和 repository 不能为空'});
    }

    // GHCR API URL
    const apiUrl = `https://ghcr.io/v2/${namespace}/${repository}/manifests/${tag}`;
    console.log('请求的 API URL:', apiUrl);

    // 检测是否为本地运行
    const isLocal = process.env.NODE_ENV === 'development';
    const proxyUrl = isLocal ? 'socks5://127.0.0.1:7890' : '';

    try {
        const agent = proxyUrl ? new SocksProxyAgent(proxyUrl) : null;
        
        // 先尝试 HEAD 请求
        console.log('尝试 HEAD 请求...');
        const headResponse = await fetch(apiUrl, {
            method: 'HEAD',
            headers: {
                'Accept': 'application/vnd.docker.distribution.manifest.v2+json',
                'User-Agent': 'pocker/1.0'
            },
            ...(agent && {agent}),
        });

        console.log('HEAD 请求响应状态码:', headResponse.status);

        if (headResponse.status === 200) {
            return res.status(200).json({exists: true});
        } else if (headResponse.status === 404) {
            return res.status(404).json({exists: false});
        } else if (headResponse.status === 401) {
            // 401 表示镜像存在但需要认证
            return res.status(200).json({exists: true, requiresAuth: true});
        } else {
            // 如果 HEAD 请求失败，尝试 GET 请求
            console.log('HEAD 请求失败，尝试 GET 请求...');
            const getResponse = await fetch(apiUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'application/vnd.docker.distribution.manifest.v2+json',
                    'User-Agent': 'pocker/1.0'
                },
                ...(agent && {agent}),
            });

            console.log('GET 请求响应状态码:', getResponse.status);

            if (getResponse.status === 200) {
                return res.status(200).json({exists: true});
            } else if (getResponse.status === 404) {
                return res.status(404).json({exists: false});
            } else if (getResponse.status === 401) {
                // 401 表示镜像存在但需要认证
                return res.status(200).json({exists: true, requiresAuth: true});
            } else {
                return res.status(500).json({error: `请求失败，状态码: ${getResponse.status}`});
            }
        }
    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            return res.status(500).json({error: '代理连接失败，请检查代理设置'});
        }
        console.error('GHCR API 请求失败:', error);
        return res.status(500).json({error: '请求失败', details: error.message});
    }
};

export default withAuth(handler);