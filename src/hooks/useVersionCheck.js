import {useEffect, useState} from 'react';
import {getAccessKey} from "@/utils/auth";

export function useVersionCheck() {
    const [needsUpdate, setNeedsUpdate] = useState(false);

    useEffect(() => {
        const checkVersion = async () => {
            try {
                const response = await fetch('/api/github/version',{
                    headers: {
                        'x-access-key': getAccessKey(),
                    },
                });
                const data = await response.json();
                console.log(data)
                if (data.currentVersion && data.latestVersion && data.currentVersion !== data.latestVersion) {
                    setNeedsUpdate(true);
                }
            } catch (error) {
                console.error('Failed to check version:', error);
            }
        };

        // 每5分钟检查一次
        checkVersion();
        // const interval = setInterval(checkVersion, 5 * 60 * 1000);
        const interval = setInterval(checkVersion, 10 * 1000);

        return () => clearInterval(interval);
    }, []);

    return {needsUpdate};
} 