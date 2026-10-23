import struct
import sys
import os

def create_windows_exe(output_path, target_url="http://localhost:3000"):
    # PE32+ (64-bit) Windows GUI Executable
    def pad(data, alignment):
        rem = len(data) % alignment
        if rem != 0:
            return data + b'\x00' * (alignment - rem)
        return data

    url_bytes = target_url.encode('ascii') + b'\x00'
    open_bytes = b'open\x00'

    image_base = 0x140000000
    section_align = 0x1000
    file_align = 0x200

    str_open_offset = 0x60
    str_url_offset = str_open_offset + len(open_bytes)

    # Machine code (x86-64)
    code = bytearray()
    code += b'\x48\x83\xec\x38' # sub rsp, 56
    code += b'\x31\xc9'         # xor ecx, ecx

    disp_open = str_open_offset - (len(code) + 7)
    code += b'\x48\x8d\x15' + struct.pack('<i', disp_open)

    disp_url = str_url_offset - (len(code) + 7)
    code += b'\x4c\x8d\x05' + struct.pack('<i', disp_url)

    code += b'\x45\x31\xc9'     # xor r9d, r9d
    code += b'\x48\xc7\x44\x24\x20\x00\x00\x00\x00' # mov qword ptr [rsp+32], 0
    code += b'\xc7\x44\x24\x28\x01\x00\x00\x00'     # mov dword ptr [rsp+40], 1 (SW_SHOWNORMAL)

    disp_call_shell = (0x2000) - (0x1000 + len(code) + 6)
    code += b'\xff\x15' + struct.pack('<i', disp_call_shell)

    code += b'\x31\xc9'         # xor ecx, ecx
    disp_call_exit = (0x2010) - (0x1000 + len(code) + 6)
    code += b'\xff\x15' + struct.pack('<i', disp_call_exit)

    code += b'\x48\x83\xc4\x38' # add rsp, 56
    code += b'\xc3'             # ret

    if len(code) > str_open_offset:
        raise ValueError("Code too long for layout")
    code += b'\x90' * (str_open_offset - len(code))
    code += open_bytes
    code += url_bytes

    text_raw = pad(code, file_align)
    text_virtual_size = len(code)

    hn_shellexec_rva = 0x2000 + 0x0A0
    hn_exitproc_rva = 0x2000 + 0x0C0
    dll_shell_rva = 0x2000 + 0x080
    dll_kernel_rva = 0x2000 + 0x090
    ilt_shell_rva = 0x2000 + 0x060
    ilt_kernel_rva = 0x2000 + 0x070

    idata = bytearray(0x200)

    # IAT:
    struct.pack_into('<Q', idata, 0x00, hn_shellexec_rva)
    struct.pack_into('<Q', idata, 0x08, 0)
    struct.pack_into('<Q', idata, 0x10, hn_exitproc_rva)
    struct.pack_into('<Q', idata, 0x18, 0)

    # ILT (OriginalFirstThunk):
    struct.pack_into('<Q', idata, 0x60, hn_shellexec_rva)
    struct.pack_into('<Q', idata, 0x68, 0)
    struct.pack_into('<Q', idata, 0x70, hn_exitproc_rva)
    struct.pack_into('<Q', idata, 0x78, 0)

    # Import Directory Table:
    struct.pack_into('<IIIII', idata, 0x20, ilt_shell_rva, 0, 0, dll_shell_rva, 0x2000)
    struct.pack_into('<IIIII', idata, 0x34, ilt_kernel_rva, 0, 0, dll_kernel_rva, 0x2010)

    idata[0x80:0x80+len(b'shell32.dll\0')] = b'shell32.dll\0'
    idata[0x90:0x90+len(b'kernel32.dll\0')] = b'kernel32.dll\0'

    idata[0xA0:0xA2] = b'\x00\x00'
    idata[0xA2:0xA2+len(b'ShellExecuteA\0')] = b'ShellExecuteA\0'

    idata[0xC0:0xC2] = b'\x00\x00'
    idata[0xC2:0xC2+len(b'ExitProcess\0')] = b'ExitProcess\0'

    idata_raw = pad(bytes(idata), file_align)
    idata_virtual_size = len(idata)

    # Headers
    dos_header = bytearray(64)
    dos_header[0:2] = b'MZ'
    struct.pack_into('<I', dos_header, 0x3C, 0x80)

    dos_stub = b'\x0e\x1f\xba\x0e\x00\xb4\x09\xcd\x21\xb8\x01\x4c\xcd\x21This program cannot be run in DOS mode.\r\r\n$\x00\x00\x00\x00\x00\x00\x00'.ljust(64, b'\x00')
    pe_sig = b'PE\x00\x00'

    coff_header = struct.pack(
        '<HHIIIHH',
        0x8664, # AMD64
        2,      # NumberOfSections
        0x6717C000,
        0, 0,
        0x00F0, # SizeOfOptionalHeader
        0x0022  # Characteristics
    )

    entry_point_rva = 0x1000
    size_of_image = section_align * 3
    size_of_headers = 0x400

    opt_standard = struct.pack(
        '<HBBIIIII',
        0x020B, # PE32+
        14, 0,
        len(text_raw),
        len(idata_raw),
        0,
        entry_point_rva,
        0x1000
    )

    opt_windows = struct.pack(
        '<QIIHHHHHHIIIIHHQQQQII',
        image_base,
        section_align,
        file_align,
        6, 0, # OS
        0, 0, # Image
        6, 0, # Subsystem
        0,
        size_of_image,
        size_of_headers,
        0,
        0x0002, # IMAGE_SUBSYSTEM_WINDOWS_GUI
        0x8160, # DllCharacteristics
        0x100000, 0x1000,
        0x100000, 0x1000,
        0,
        16 # NumberOfRvaAndSizes
    )

    data_dirs = bytearray(16 * 8)
    struct.pack_into('<II', data_dirs, 1 * 8, 0x2020, 40)
    struct.pack_into('<II', data_dirs, 12 * 8, 0x2000, 32)

    opt_header = opt_standard + opt_windows + data_dirs

    sec_text = struct.pack(
        '<8sIIIIIIHHI',
        b'.text\x00\x00\x00',
        text_virtual_size,
        0x1000,
        len(text_raw),
        size_of_headers,
        0, 0, 0, 0,
        0x60000020
    )

    sec_idata = struct.pack(
        '<8sIIIIIIHHI',
        b'.idata\x00\x00',
        idata_virtual_size,
        0x2000,
        len(idata_raw),
        size_of_headers + len(text_raw),
        0, 0, 0, 0,
        0xC0000040
    )

    headers = dos_header + dos_stub + pe_sig + coff_header + opt_header + sec_text + sec_idata
    headers = pad(headers, size_of_headers)

    final_pe = headers + text_raw + idata_raw

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'wb') as f:
        f.write(final_pe)

    print(f"Generated valid PE64 binary: {output_path} ({len(final_pe)} bytes)")

if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else "public/####.exe"
    create_windows_exe(out, "http://localhost:3000")
