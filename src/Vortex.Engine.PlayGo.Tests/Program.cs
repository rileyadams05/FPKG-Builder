using LibOrbisPkg.PKG;

var cases = new[]
{
    // This arrangement reproduces the upstream one-pass under-allocation:
    // the final aligned package needs 68 bytes, while the old estimate reserved 36.
    new AllocationCase(0x2000, 0x4000, new uint[] { 507904 }, 65536, 68),
    new AllocationCase(0x2000, 0x8000, new uint[] { 0, 15, 16, 17, 65535 }, 0x80000, null),
    new AllocationCase(0x2000, 0x7fff0, new uint[] { 1, 0x7ffff, 0x80000 }, 0x100000, null),
    new AllocationCase(0x2000, 0x10000, new uint[] { 0x7fff0, 0x10000 }, 0, null),
};

foreach (var test in cases)
{
    var actual = PkgBuilder.CalculatePlayGoChunkShaReservation(
        test.BodyOffset,
        test.OffsetBeforeChunkSha,
        test.FollowingEntrySizes,
        test.PfsImageSize);
    var independentlyCalculated = CalculateByRepeatedFinalSize(test);
    if (actual != independentlyCalculated || (test.Expected is uint expected && actual != expected))
        throw new InvalidOperationException(
            $"PlayGo reservation test failed: expected {test.Expected?.ToString() ?? independentlyCalculated.ToString()}, got {actual}.");
}

for (ulong offset = 0x2000; offset < 0x280000; offset += 4093)
for (ulong pfs = 0; pfs < 0x240000; pfs += 32749)
{
    var test = new AllocationCase(0x2000, offset, new uint[] { 17, 0x10001, 0x7ffff }, pfs, null);
    var actual = PkgBuilder.CalculatePlayGoChunkShaReservation(
        test.BodyOffset,
        test.OffsetBeforeChunkSha,
        test.FollowingEntrySizes,
        test.PfsImageSize);
    if (actual != CalculateByRepeatedFinalSize(test))
        throw new InvalidOperationException($"Boundary sweep mismatch at offset 0x{offset:x}, PFS size 0x{pfs:x}.");
}

Console.WriteLine($"PlayGo chunk-hash allocation checks passed ({cases.Length} fixed cases and boundary sweep).");

static uint CalculateByRepeatedFinalSize(AllocationCase test)
{
    ulong reservation = 0;
    for (var attempt = 0; attempt < 64; attempt++)
    {
        var end = Align(checked(test.OffsetBeforeChunkSha + reservation), 16);
        foreach (var size in test.FollowingEntrySizes) end = Align(checked(end + size), 16);
        var packageSize = checked(Align(end, 0x80000) + test.PfsImageSize);
        var required = checked(4UL * (packageSize / 0x10000));
        if (required == reservation) return checked((uint)required);
        reservation = required;
    }
    throw new InvalidOperationException("Independent PlayGo allocation model did not converge.");
}

static ulong Align(ulong value, ulong alignment) =>
    value % alignment == 0 ? value : checked(value + alignment - value % alignment);

sealed record AllocationCase(
    ulong BodyOffset,
    ulong OffsetBeforeChunkSha,
    IReadOnlyList<uint> FollowingEntrySizes,
    ulong PfsImageSize,
    uint? Expected);
