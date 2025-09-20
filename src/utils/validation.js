/**
 * Docker镜像和标签验证工具函数
 * 基于Docker官方规范和华为云SWR要求
 */

// Docker仓库名称验证规则
const REPOSITORY_NAME_REGEX = /^[a-z0-9]+([._-][a-z0-9]+)*$/;
const REPOSITORY_NAME_MAX_LENGTH = 255;

// Docker标签验证规则
const TAG_REGEX = /^[\w][\w.-]{0,127}$/;
const TAG_MAX_LENGTH = 128;

/**
 * 验证Docker仓库名称
 * @param {string} name - 仓库名称
 * @returns {Object} - {isValid: boolean, error: string}
 */
export const validateRepositoryName = (name) => {
    if (!name || typeof name !== 'string') {
        return {
            isValid: false,
            error: '仓库名称不能为空'
        };
    }

    const trimmedName = name.trim();

    // 检查是否为空
    if (!trimmedName) {
        return {
            isValid: false,
            error: '仓库名称不能为空'
        };
    }

    // 检查长度
    if (trimmedName.length > REPOSITORY_NAME_MAX_LENGTH) {
        return {
            isValid: false,
            error: `仓库名称不能超过${REPOSITORY_NAME_MAX_LENGTH}个字符`
        };
    }

    // 检查是否包含大写字母
    if (/[A-Z]/.test(trimmedName)) {
        return {
            isValid: false,
            error: '仓库名称必须为小写字母'
        };
    }

    // 检查格式是否符合规范
    if (!REPOSITORY_NAME_REGEX.test(trimmedName)) {
        return {
            isValid: false,
            error: '仓库名称只能包含小写字母、数字、连字符(-)、下划线(_)和点(.)'
        };
    }

    // 检查是否以特殊字符开头或结尾
    if (/^[._-]|[._-]$/.test(trimmedName)) {
        return {
            isValid: false,
            error: '仓库名称不能以连字符、下划线或点开头或结尾'
        };
    }

    // 检查是否包含连续的特殊字符
    if (/[._-]{2,}/.test(trimmedName)) {
        return {
            isValid: false,
            error: '仓库名称不能包含连续的特殊字符'
        };
    }

    return {
        isValid: true,
        error: null
    };
};

/**
 * 验证Docker标签名称
 * @param {string} tag - 标签名称
 * @returns {Object} - {isValid: boolean, error: string}
 */
export const validateTag = (tag) => {
    if (!tag || typeof tag !== 'string') {
        return {
            isValid: false,
            error: '标签名称不能为空'
        };
    }

    const trimmedTag = tag.trim();

    // 检查是否为空
    if (!trimmedTag) {
        return {
            isValid: false,
            error: '标签名称不能为空'
        };
    }

    // 检查长度
    if (trimmedTag.length > TAG_MAX_LENGTH) {
        return {
            isValid: false,
            error: `标签名称不能超过${TAG_MAX_LENGTH}个字符`
        };
    }

    // 检查格式是否符合规范
    if (!TAG_REGEX.test(trimmedTag)) {
        return {
            isValid: false,
            error: '标签名称只能包含字母、数字、下划线、点和连字符，且必须以字母、数字或下划线开头'
        };
    }

    return {
        isValid: true,
        error: null
    };
};

/**
 * 验证Docker镜像地址格式
 * @param {string} imageAddress - 镜像地址
 * @param {string} sourceType - 镜像源类型：'dockerhub' | 'ghcr'
 * @returns {Object} - {isValid: boolean, error: string, parsed: Object}
 */
export const validateImageAddress = (imageAddress, sourceType = 'dockerhub') => {
    if (!imageAddress || typeof imageAddress !== 'string') {
        return {
            isValid: false,
            error: '镜像地址不能为空',
            parsed: null
        };
    }

    const trimmedAddress = imageAddress.trim();

    if (!trimmedAddress) {
        return {
            isValid: false,
            error: '镜像地址不能为空',
            parsed: null
        };
    }

    // 移除可能的 "docker pull " 前缀
    const cleanAddress = trimmedAddress.replace(/^docker\s+pull\s+/, '');

    // 根据 sourceType 使用不同的验证规则
    let imageRegex;
    
    if (sourceType === 'ghcr') {
        // GHCR 格式: [ghcr.io/]namespace/repository[:tag]
        // 移除可能的 ghcr.io 前缀
        const ghcrAddress = cleanAddress.replace(/^ghcr\.io\//, '');
        imageRegex = /^([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)(?::([a-zA-Z0-9._-]+))?$/;
        
        const match = ghcrAddress.match(imageRegex);
        
        if (!match) {
            return {
                isValid: false,
                error: 'GHCR 镜像地址格式不正确，请使用格式：namespace/repository[:tag]',
                parsed: null
            };
        }

        const [, namespace, repository, tag] = match;

        // 验证 namespace 和 repository 不为空
        if (!namespace || !repository) {
            return {
                isValid: false,
                error: 'namespace 和 repository 不能为空',
                parsed: null
            };
        }

        // 验证标签（如果存在）
        if (tag) {
            const tagValidation = validateTag(tag);
            if (!tagValidation.isValid) {
                return {
                    isValid: false,
                    error: `标签验证失败：${tagValidation.error}`,
                    parsed: null
                };
            }
        }

        return {
            isValid: true,
            error: null,
            parsed: {
                registry: 'ghcr.io',
                repository: `${namespace}/${repository}`,
                tag: tag || 'latest',
                digest: null,
                fullAddress: cleanAddress
            }
        };
    } else {
        // Docker Hub 格式: [registry/]namespace/repository[:tag][@digest]
        imageRegex = /^(?:([a-zA-Z0-9.-]+(?::[0-9]+)?)\/)?((?:[a-z0-9]+(?:[._-][a-z0-9]+)*\/)*[a-z0-9]+(?:[._-][a-z0-9]+)*)(?::([a-zA-Z0-9._-]+))?(?:@([a-zA-Z0-9:.-]+))?$/;
        
        const match = cleanAddress.match(imageRegex);
        
        if (!match) {
            return {
                isValid: false,
                error: '镜像地址格式不正确，请使用格式：[registry/]namespace/repository[:tag]',
                parsed: null
            };
        }

        let [, registry, repository, tag, digest] = match;

        // 验证仓库名称
        const repoValidation = validateRepositoryName(repository);
        if (!repoValidation.isValid) {
            return {
                isValid: false,
                error: `仓库名称验证失败：${repoValidation.error}`,
                parsed: null
            };
        }

        // 验证标签（如果存在）
        if (tag) {
            const tagValidation = validateTag(tag);
            if (!tagValidation.isValid) {
                return {
                    isValid: false,
                    error: `标签验证失败：${tagValidation.error}`,
                    parsed: null
                };
            }
        }

        return {
            isValid: true,
            error: null,
            parsed: {
                registry: registry || 'docker.io',
                repository,
                tag: tag || 'latest',
                digest,
                fullAddress: cleanAddress
            }
        };
    }
};

/**
 * 实时验证输入框内容
 * @param {string} value - 输入值
 * @param {string} type - 验证类型：'repository' | 'tag' | 'image'
 * @returns {Object} - {isValid: boolean, error: string, warning: string}
 */
export const validateInput = (value, type) => {
    switch (type) {
        case 'repository':
            return validateRepositoryName(value);
        case 'tag':
            return validateTag(value);
        case 'image':
            return validateImageAddress(value);
        default:
            return {
                isValid: false,
                error: '未知的验证类型'
            };
    }
};

/**
 * 获取验证提示信息
 * @param {string} type - 验证类型
 * @returns {string} - 提示信息
 */
export const getValidationHint = (type) => {
    switch (type) {
        case 'repository':
            return '只能包含小写字母、数字、连字符(-)、下划线(_)和点(.)，不能以特殊字符开头或结尾';
        case 'tag':
            return '只能包含字母、数字、下划线、点和连字符，最大128个字符';
        case 'image':
            return '格式：[registry/]namespace/repository[:tag]，例如：nginx:alpine';
        case 'ghcrImage':
            return '格式：namespace/repository[:tag]，例如：owner/repo:latest';
        default:
            return '';
    }
};
