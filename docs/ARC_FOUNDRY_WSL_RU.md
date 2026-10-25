# Arc Foundry на Windows через WSL

Официальная [инструкция Arc](https://docs.arc.io/arc/tutorials/install-arc-foundry) поставляет Linux-бинарники `arc-forge`, `arc-cast`, `arc-anvil` из [релизов Circle](https://github.com/circlefin/arc-foundry/releases). Обычный Windows `forge` здесь компилирует контракт и выполняет тесты, но `contracts:build` после компиляции падает на глобальном кэше сигнатур. Arc Foundry нужен также для достоверной Arc-specific симуляции USDC/gas; [обычный Foundry имеет ограничения](https://docs.arc.io/arc/tutorials/troubleshoot-with-arc-foundry).

В текущем окружении `wsl.exe --status` и `wsl.exe --list --quiet` вернули `Wsl/EnumerateDistros/Service/E_ACCESSDENIED`. Поэтому WSL/Arc Foundry **не установлены и не запущены здесь**. Не отключать защиту Windows и не искать неофициальные бинарники для обхода.

## Действия владельца на разрешённом Windows-хосте

1. В PowerShell: `wsl --status` и `wsl --list --verbose`. Если WSL отсутствует, следовать [Microsoft WSL install](https://learn.microsoft.com/en-us/windows/wsl/install) (`wsl --install` в административном PowerShell и перезапуск при запросе). Если политика хоста запрещает WSL, согласовать это с администратором.
2. Внутри WSL открыть эту папку как `/mnt/c/Hackathons/Arc/AtomicCloseout/source`. Выбрать Linux-архив для архитектуры хоста на официальной странице релизов Circle, сверить имя, версию и SHA-256 до извлечения. Официальная инструкция Arc приводит такие команды; `<version>-<target>` заменить **точным именем проверенного архива**:

   ```bash
   tar -xzf arc-foundry-<version>-<target>.tar.gz
   mkdir -p ~/.local/bin
   mv forge ~/.local/bin/arc-forge
   mv cast ~/.local/bin/arc-cast
   mv anvil ~/.local/bin/arc-anvil
   export PATH="$HOME/.local/bin:$PATH"
   ```

   Не запускать произвольный install pipe и не брать mirror. Сохранить `PATH` в профиле shell, как рекомендует Arc.
3. Проверить `arc-forge --version`, `arc-cast --version`, `arc-anvil --version`; сохранить версии в `TEST_REPORT_RU.md`. Затем в исходниках выполнить `arc-forge build` и `arc-forge test --network arc`. Сравнить compiler `0.8.28`, Cancun, optimizer 200, ABI и creation bytecode с `node scripts/mainnet-artifact-audit.mjs`. После пересборки запустить весь набор тестов и записать точное число PASS.
4. Только при доступном разрешённом RPC выполнить read-only `node scripts/mainnet-wallet-preflight.mjs <A> <B> <C>`, `node scripts/mainnet-deploy.mjs <A>` и dry-run `arc-forge script contracts/script/DeployAtomicCloseout.s.sol --rpc-url https://rpc.mainnet.arc.io` с `CONFIRM_MAINNET=I_UNDERSTAND_THIS_USES_REAL_USDC` **без `--broadcast`**. Этот флаг нужен скрипту для mainnet simulation, сам по себе ничего не отправляет.

Не вводить private key/seed в чат, код, аргументы shell или `.env`. Подпись допустима только на доверенном устройстве с подтверждённым Rabby/hardware wallet, после отдельного разрешения и просмотра `from`, назначения, газа и предельной стоимости. Обычный `arc-forge script --broadcast` нельзя считать Rabby-подписью: способ локальной подписи должен быть отдельно проверен с установленной версией Arc Foundry. До этого запускать только read-only и dry-run команды.
