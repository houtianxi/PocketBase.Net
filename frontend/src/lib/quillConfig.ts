import { uploadFile, getFilePreviewUrl } from './fileUpload';

/**
 * 创建图片handler工厂函数 - 确保this绑定正确
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createImageHandler(quill: any) {
    return function (this: any) {
        const editorInstance = quill || this;
        const input = document.createElement('input');
        input.setAttribute('type', 'file');
        input.setAttribute('accept', 'image/*');

        input.addEventListener('change', async () => {
            const file = input.files?.[0];
            if (!file) return;

            try {
                // 上传文件
                const response = await uploadFile(file, 'editor-images');

                // 插入到编辑器中
                const range = editorInstance.getSelection();
                if (range) {
                    const previewUrl = getFilePreviewUrl(response.fileName, 'editor-images');
                    editorInstance.insertEmbed(range.index, 'image', previewUrl);
                    editorInstance.setSelection(range.index + 1);
                }
            } catch (error) {
                console.error('图片上传失败:', error);
                alert('图片上传失败');
            }
        });

        input.click();
    };
}

/**
 * 创建视频handler工厂函数 - 确保this绑定正确
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createVideoHandler(quill: any) {
    return function (this: any) {
        const editorInstance = quill || this;
        const input = document.createElement('input');
        input.setAttribute('type', 'file');
        input.setAttribute('accept', 'video/mp4,video/webm,video/ogg');

        input.addEventListener('change', async () => {
            const file = input.files?.[0];
            if (!file) return;

            try {
                // 上传文件
                const response = await uploadFile(file, 'editor-videos');

                // 插入到编辑器中
                const range = editorInstance.getSelection();
                if (range) {
                    const videoUrl = getFilePreviewUrl(response.fileName, 'editor-videos');
                    editorInstance.insertEmbed(range.index, 'video', videoUrl);
                    editorInstance.setSelection(range.index + 1);
                }
            } catch (error) {
                console.error('视频上传失败:', error);
                alert('视频上传失败');
            }
        });

        input.click();
    };
}

/**
 * 创建Quill配置，支持自定义image/video handlers
 * 这是一个函数，在模块初始化时需要动态设置handlers
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createQuillModules(quillInstance?: any) {
    return {
        toolbar: {
            container: [
                [{ header: [1, 2, 3, false] }],
                [{ size: ['small', false, 'large', 'huge'] }],
                ['bold', 'italic', 'underline', 'strike'],
                [{ color: [] }, { background: [] }],
                [{ list: 'ordered' }, { list: 'bullet' }],
                ['blockquote', 'code-block'],
                ['link', 'image', 'video'],
                ['clean'],
            ],
            handlers: quillInstance
                ? {
                    image: createImageHandler(quillInstance),
                    video: createVideoHandler(quillInstance),
                }
                : {},
        },
        clipboard: {
            matchVisual: false,
        },
    };
}

// 保持向后兼容 - 不带handlers的基础配置
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const defaultQuillModules: any = {
    toolbar: {
        container: [
            [{ header: [1, 2, 3, false] }],
            [{ size: ['small', false, 'large', 'huge'] }],
            ['bold', 'italic', 'underline', 'strike'],
            [{ color: [] }, { background: [] }],
            [{ list: 'ordered' }, { list: 'bullet' }],
            ['blockquote', 'code-block'],
            ['link', 'image', 'video'],
            ['clean'],
        ],
    },
    clipboard: {
        matchVisual: false,
    },
};

// 导出handlers工厂函数供外部使用
export { createImageHandler, createVideoHandler };
