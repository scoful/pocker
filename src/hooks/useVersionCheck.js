import {useEffect, useRef, useState} from 'react';
import {apiRequest} from '@/utils/api';
import {VERSION_CONSTANTS} from '@/utils/constants';

export function useVersionCheck() {
    const [needsUpdate, setNeedsUpdate] = useState(false);
    const isChecking = useRef(false);

    useEffect(() => {
        const checkVersion = async () => {
            // 如果已经在检查中，则跳过
            if (isChecking.current) return;

            // 检查是否在24小时内关闭过
            const dismissedAt = localStorage.getItem(VERSION_CONSTANTS.NOTIFICATION_DISMISS_KEY);
            if (dismissedAt) {
                const dismissedTime = parseInt(dismissedAt, 10);
                const now = Date.now();
                if (now - dismissedTime < VERSION_CONSTANTS.DISMISS_DURATION) {
                    return; // 在禁止提醒时间内，直接返回
                }
            }

            try {
                isChecking.current = true;
                const response = await apiRequest('/api/github/latest-tag');
                const data = await response.json();
                if (data.currentVersion && data.latestVersion) {
                    const currentParts = data.currentVersion.replace('v', '').split('.');
                    const latestParts = data.latestVersion.replace('v', '').split('.');

                    for (let i = 0; i < 3; i++) {
                        const current = parseInt(currentParts[i], 10);
                        const latest = parseInt(latestParts[i], 10);
                        if (current < latest) {
                            setNeedsUpdate(true);
                            break;
                        } else if (current > latest) {
                            break;
                        }
                    }
                }
            } catch (error) {
                console.error('Failed to check version:', error);
            } finally {
                isChecking.current = false;
            }
        };

        checkVersion();
    }, []);

    return {needsUpdate};
} 