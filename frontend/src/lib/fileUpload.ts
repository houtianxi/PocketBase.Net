import { api } from './api';

export interface FileUploadResponse {
    fileName: string;
    originalFileName?: string;
    fileSize: number;
    contentType: string;
}

export interface FileMetadata {
    storedFileName: string;
    originalFileName: string;
    mimeType: string;
    fileSize: number;
    url: string;
    createdAt: string;
}

/**
 * 上传文件到服务器
 */
export async function uploadFile(file: File, type: string = 'attachments'): Promise<FileUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post<FileUploadResponse>('/files/upload', formData, {
        params: { type },
        // 不要手动设置Content-Type，让浏览器自动设置multipart/form-data边界
        timeout: 300000, // 5分钟超时
    });

    return response.data;
}

/**
 * 获取文件预览URL
 */
export function getFilePreviewUrl(fileName: string, type: string = 'attachments'): string {
    return `${api.defaults.baseURL}/files/stream/${type}/${fileName}`;
}

/**
 * 获取文件下载URL
 */
export function getFileDownloadUrl(fileName: string, type: string = 'attachments'): string {
    return `${api.defaults.baseURL}/files/download/${fileName}?type=${type}`;
}

/**
 * 删除文件
 */
export async function deleteFile(fileName: string, type: string = 'attachments'): Promise<void> {
    await api.delete(`/files/${fileName}`, {
        params: { type },
    });
}

/**
 * 批量删除文件
 */
export async function deleteFiles(fileNames: string[], type: string = 'attachments'): Promise<void> {
    for (const fileName of fileNames) {
        try {
            await deleteFile(fileName, type);
        } catch (error) {
            console.error(`删除文件 ${fileName} 失败:`, error);
        }
    }
}

/**
 * 批量获取文件元数据（真实文件名、大小、类型）
 */
export async function getFileMetadataBatch(fileNames: string[], type: string = 'attachments'): Promise<FileMetadata[]> {
    if (!fileNames.length) return [];

    const response = await api.get<FileMetadata[]>('/files/metadata', {
        params: { type, fileNames },
        paramsSerializer: {
            indexes: null,
        },
    });

    return response.data ?? [];
}
