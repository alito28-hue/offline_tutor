; Windows installer. Compile with: ISCC /DKit=full|online /DAppVersion=x.y.z desktop\windows\amara.iss
; The full kit carries the models and needs no internet. The online kit downloads them when the app first opens.
#ifndef Kit
  #define Kit "online"
#endif
#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif
#define Source "..\..\out\" + Kit + "\Amara-win32-x64"
#if Kit == "full"
  #define Label "Completo-Offline"
#else
  #define Label "Instalador-Online"
#endif

[Setup]
AppId={{7C7E8F0A-5B0E-4A55-9B3D-2F4B7A1C9E10}
AppName=Amara
AppVersion={#AppVersion}
AppPublisher=Alex Smith
AppPublisherURL=https://amaratutor.org
AppSupportURL=https://amaratutor.org/feedback/
DefaultDirName={autopf}\Amara
DefaultGroupName=Amara
DisableProgramGroupPage=yes
DisableDirPage=auto
; No administrator password: a teacher can install it on a school computer.
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
OutputDir=..\..\dist
OutputBaseFilename=Amara-{#AppVersion}-Windows-{#Label}
SetupIconFile=..\assets\icon.ico
UninstallDisplayIcon={app}\Amara.exe
Compression=lzma2/fast
SolidCompression=no
WizardStyle=modern
ShowLanguageDialog=auto

[Languages]
Name: "es"; MessagesFile: "compiler:Languages\Spanish.isl"
Name: "en"; MessagesFile: "compiler:Default.isl"
Name: "pt"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[CustomMessages]
es.NoVulkan=Esta computadora no tiene Vulkan, que Amara necesita para funcionar. Se instala con el driver de video: actualizalo antes de usar Amara.%n%n¿Querés instalar Amara de todos modos?
en.NoVulkan=This computer doesn't have Vulkan, which Amara needs to run. It comes with the video driver, so update that before using Amara.%n%nDo you want to install Amara anyway?
pt.NoVulkan=Este computador não tem Vulkan, de que a Amara precisa para funcionar. Ele vem com o driver de vídeo: atualize-o antes de usar a Amara.%n%nQuer instalar a Amara mesmo assim?
es.DesktopIcon=Crear un acceso directo en el Escritorio
en.DesktopIcon=Create a desktop shortcut
pt.DesktopIcon=Criar um atalho na Área de Trabalho

[Tasks]
Name: "desktopicon"; Description: "{cm:DesktopIcon}"

[Files]
Source: "{#Source}\*"; DestDir: "{app}"; Excludes: "resources\models\*"; Flags: recursesubdirs createallsubdirs ignoreversion
#if Kit == "full"
; The models barely compress and would take a very long time to try.
Source: "{#Source}\resources\models\*"; DestDir: "{app}\resources\models"; Flags: nocompression ignoreversion
#endif

[Icons]
Name: "{group}\Amara"; Filename: "{app}\Amara.exe"
Name: "{group}\{cm:UninstallProgram,Amara}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\Amara"; Filename: "{app}\Amara.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\Amara.exe"; Description: "{cm:LaunchProgram,Amara}"; Flags: nowait postinstall skipifsilent

[Code]
function InitializeSetup(): Boolean;
begin
  Result := True;
  if not FileExists(ExpandConstant('{sys}\vulkan-1.dll')) then
    Result := SuppressibleMsgBox(CustomMessage('NoVulkan'), mbConfirmation, MB_YESNO, IDYES) = IDYES;
end;
