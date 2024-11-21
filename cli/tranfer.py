import os
import subprocess
from pathlib import Path
from typing import List

def push_to_android(file_path: str, auto_delete: bool = True) -> bool:
    """
    Push a single file to Android device using ADB and optionally delete it after successful push.
    
    Args:
        file_path: Path to the file to be pushed
        auto_delete: Whether to delete the file after successful push
        
    Returns:
        bool: True if successful, False otherwise
    """
    try:
        # Lấy tên file từ đường dẫn
        file_name = os.path.basename(file_path)
        # Đường dẫn đích trên Android
        android_path = f"/sdcard/Movies/TikTok/{file_name}"
        
        # Thực thi lệnh ADB push
        process = subprocess.run(
            ['adb', 'push', file_path, android_path],
            capture_output=True,
            text=True
        )
        
        if process.returncode == 0:
            print(f"[+] Đã push thành công: {android_path}")
            
            # Thêm lệnh media scan sau khi push thành công
            scan_process = subprocess.run(
                ['adb', 'shell', 'am', 'broadcast', '-a', 
                 'android.intent.action.MEDIA_SCANNER_SCAN_FILE',
                 '-d', f'file://{android_path}'],
                capture_output=True,
                text=True
            )
            
            if scan_process.returncode == 0:
                print("[+] Đã quét media thành công")
            else:
                print(f"[!] Lỗi khi quét media: {scan_process.stderr}")
            
            # Xóa file nếu auto_delete được bật
            if auto_delete:
                try:
                    os.remove(file_path)
                    print(f"[+] Đã xóa file gốc: {file_path}")
                except Exception as del_error:
                    print(f"[!] Không thể xóa file gốc: {str(del_error)}")
            
            return True
        else:
            print(f"[X] Lỗi khi push file: {process.stderr}")
            return False
            
    except Exception as e:
        print(f"[X] Lỗi: {str(e)}")
        return False

def push_folder_to_android(folder_path: str, file_extensions: List[str] = None, auto_delete: bool = True) -> None:
    """
    Push all files from a folder to Android device and optionally delete them after successful push.
    
    Args:
        folder_path: Path to the folder containing files
        file_extensions: List of file extensions to filter (optional)
        auto_delete: Whether to delete files after successful push
    """
    try:
        # Kiểm tra folder có tồn tại không
        if not os.path.exists(folder_path):
            print(f"[X] Folder không tồn tại: {folder_path}")
            return
            
        # Chuyển đổi sang Path object
        folder = Path(folder_path)
        
        # Đếm số file đã xử lý
        total_files = 0
        successful_pushes = 0
        
        # Thu thập tất cả file trước khi xử lý
        files_to_process = []
        for file_path in folder.rglob('*'):
            if file_path.is_file():
                # Kiểm tra phần mở rộng nếu có yêu cầu lọc
                if file_extensions:
                    if file_path.suffix.lower() not in file_extensions:
                        continue
                files_to_process.append(file_path)
        
        # Xử lý từng file
        for file_path in files_to_process:
            total_files += 1
            print(f"\n[*] Đang xử lý file ({total_files}/{len(files_to_process)}): {file_path.name}")
            
            if push_to_android(str(file_path), auto_delete):
                successful_pushes += 1
                    
        # In thống kê
        print(f"\n=== Tổng kết ===")
        print(f"Tổng số file: {total_files}")
        print(f"Push thành công: {successful_pushes}")
        print(f"Push thất bại: {total_files - successful_pushes}")
        
        # Kiểm tra và xóa các file đã push thành công
        if auto_delete and successful_pushes == total_files:
            try:
                # Xóa các file đã push thành công
                for file_path in files_to_process:
                    if file_path.is_file():  # Chỉ xóa file, không xóa folder
                        file_path.unlink()
                        print(f"[+] Đã xóa file: {file_path}")
                
            except Exception as del_error:
                print(f"[!] Lỗi khi xóa file: {str(del_error)}")
        
    except Exception as e:
        print(f"[X] Lỗi khi xử lý folder: {str(e)}")

# Ví dụ sử dụng
if __name__ == "__main__":
    # Push tất cả file từ một folder và xóa sau khi push thành công
    folder_path = r"C:\Users\toanvuvv\Downloads\Video"
    
    # Push và xóa tất cả file
    push_folder_to_android(folder_path, auto_delete=True)
    
    # # Hoặc chỉ push và xóa các file có định dạng cụ thể
    # file_extensions = ['.jpg', '.png', '.pdf']
    # push_folder_to_android(folder_path, file_extensions, auto_delete=True)